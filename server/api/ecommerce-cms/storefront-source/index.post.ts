import { pool } from '~/server/db'
import {
  createPrivateStorefrontRepository,
  ensureStorefrontSourcesTable,
  publicStorefrontSourceStatus,
} from '~/server/utils/storefrontSource'
import {
  addVercelDomain,
  createVercelGitDeployment,
  configureVercelStorefrontEnvironment,
  deploymentState,
  deploymentUrl,
  ensureVercelStorefrontProject,
  makeVercelStorefrontEmbeddable,
  storefrontHostnames,
  vercelProjectName,
} from '~/server/utils/vercelStorefront'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const companyId = session.data.companyId
  await ensureStorefrontSourcesTable()

  const lockClient = await pool.connect()
  const lockKey = `storefront-source:${companyId}`
  try {
    const lock = await lockClient.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [lockKey],
    )
    if (!lock.rows[0]?.locked) return publicStorefrontSourceStatus('CREATING')

    const current = await lockClient.query<{
      status: 'CREATING' | 'READY' | 'FAILED'
      previewUrl: string | null
      previewStatus: string | null
      productionStatus: string | null
    }>(
      `SELECT status, COALESCE(preview_branch_url, preview_deployment_url) AS "previewUrl",
              preview_deployment_status AS "previewStatus",
              production_deployment_status AS "productionStatus"
       FROM storefront_sources WHERE company_id = $1`,
      [companyId],
    )
    if (current.rows[0]?.status === 'READY') {
      const row = current.rows[0]
      return publicStorefrontSourceStatus('READY', row.previewUrl, row.previewStatus, row.productionStatus)
    }

    const company = await lockClient.query<{ storeUniqueName: string | null }>(
      'SELECT store_unique_name AS "storeUniqueName" FROM companies WHERE id = $1',
      [companyId],
    )
    const repositoryName = company.rows[0]?.storeUniqueName?.trim()
    if (!repositoryName) {
      throw createError({ statusCode: 409, statusMessage: 'Your store address must be configured first' })
    }

    await lockClient.query(
      `INSERT INTO storefront_sources (company_id, status, error_message, updated_at)
       VALUES ($1, 'CREATING', NULL, NOW())
       ON CONFLICT (company_id) DO UPDATE
       SET status = 'CREATING', error_message = NULL, updated_at = NOW()`,
      [companyId],
    )

    try {
      const runtime = useRuntimeConfig(event)
      const repository = await createPrivateStorefrontRepository(runtime.githubStorefront, repositoryName)
      const projectName = vercelProjectName(repositoryName)
      const project = await ensureVercelStorefrontProject(
        runtime.vercelStorefront,
        projectName,
        repository.fullName,
      )
      await makeVercelStorefrontEmbeddable(runtime.vercelStorefront, project.id)
      await configureVercelStorefrontEnvironment(runtime.vercelStorefront, project.id, companyId)
      /*
       * Stable custom domains, attached once at creation.
       *
       *   acme.markit.co.in          -> production (main)
       *   preview-acme.markit.co.in  -> preview branch
       *
       * These addresses never change, unlike Vercel's per-deployment URLs. That
       * is what lets the editor's iframe simply refresh after a build instead of
       * having to be pointed at a new address each time.
       *
       * Requires markit.co.in to be verified on the Vercel account once; after
       * that the wildcard DNS (*.markit.co.in) covers every seller with no
       * further DNS work, and Vercel issues certificates automatically.
       *
       * Non-fatal: a domain failure must not fail provisioning, because the
       * storefront still works on its Vercel URL. It is logged and the seller
       * keeps a working site.
       */
      const rootDomain = process.env.STOREFRONT_ROOT_DOMAIN || 'markit.co.in'
      const hostnames = storefrontHostnames(repositoryName, rootDomain)
      try {
        await addVercelDomain(runtime.vercelStorefront, project.id, hostnames.production)
        await addVercelDomain(runtime.vercelStorefront, project.id, hostnames.preview, 'preview')
      } catch (error: any) {
        console.error('[storefront-source] domain assignment failed', {
          companyId, hostnames, error: String(error?.message || error),
        })
      }

      /*
       * Explicit deployments HERE ONLY, and deliberately.
       *
       * The repo already has commits by the time the Vercel project is linked,
       * and Vercel does not retroactively build existing history - so without
       * these the storefront would have no first build. Per-edit deployments are
       * a different case: the container's push triggers those automatically, so
       * storefrontAgent.ts no longer calls this (it was producing two builds per
       * change).
       */
      const [productionDeployment, previewDeployment] = await Promise.all([
        createVercelGitDeployment(runtime.vercelStorefront, project.id, projectName, repository.id, 'main'),
        createVercelGitDeployment(runtime.vercelStorefront, project.id, projectName, repository.id, 'preview'),
      ])
      await lockClient.query(
        `UPDATE storefront_sources
         SET repository_id = $2, repository_full_name = $3, preview_branch = 'preview',
             vercel_project_id = $4,
             production_deployment_id = $5, production_deployment_url = $6,
             production_deployment_status = $7,
             preview_deployment_id = $8, preview_deployment_url = $9,
             preview_deployment_status = $10,
             production_url = $11, preview_branch_url = $12,
             status = 'CREATING', error_message = NULL, updated_at = NOW()
         WHERE company_id = $1`,
        [
          companyId,
          repository.id,
          repository.fullName,
          project.id,
          productionDeployment.id,
          deploymentUrl(productionDeployment),
          deploymentState(productionDeployment),
          previewDeployment.id,
          deploymentUrl(previewDeployment),
          deploymentState(previewDeployment),
          // Stable custom hostnames - what the editor iframe and the seller use.
          `https://${hostnames.production}`,
          `https://${hostnames.preview}`,
        ],
      )
      return publicStorefrontSourceStatus(
        'CREATING',
        null,
        deploymentState(previewDeployment),
        deploymentState(productionDeployment),
        previewDeployment.id,
      )
    } catch (error: any) {
      await lockClient.query(
        `UPDATE storefront_sources SET status = 'FAILED', error_message = $2, updated_at = NOW()
         WHERE company_id = $1`,
        [companyId, String(error?.message || error).slice(0, 1000)],
      )
      console.error('[storefront-source] provisioning failed', { companyId, error })
      throw createError({ statusCode: 502, statusMessage: 'Storefront setup failed. Please try again.' })
    }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => undefined)
    lockClient.release()
  }
})
