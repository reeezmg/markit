import { pool } from '~/server/db'
import { ensureStorefrontSourcesTable, publicStorefrontSourceStatus } from '~/server/utils/storefrontSource'
import {
  deploymentState,
  deploymentUrl,
  getVercelDeployment,
  getVercelDeploymentAliases,
  latestVercelDeployment,
  makeVercelStorefrontEmbeddable,
  stablePreviewUrl,
  stableProductionUrl,
} from '~/server/utils/vercelStorefront'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const refreshLatest = getQuery(event).refreshLatest === '1'
  await ensureStorefrontSourcesTable()

  const { rows } = await pool.query<{
    status: 'CREATING' | 'READY' | 'FAILED'
    vercelProjectId: string | null
    previewDeploymentId: string | null
    previewBranchUrl: string | null
    previewUrl: string | null
    previewStatus: string | null
    productionDeploymentId: string | null
    productionUrl: string | null
    productionStatus: string | null
  }>(
    `SELECT status, vercel_project_id AS "vercelProjectId",
            preview_deployment_id AS "previewDeploymentId",
            preview_branch_url AS "previewBranchUrl",
            preview_deployment_url AS "previewUrl",
            preview_deployment_status AS "previewStatus",
            production_deployment_id AS "productionDeploymentId",
            production_url AS "productionUrl",
            production_deployment_status AS "productionStatus"
     FROM storefront_sources WHERE company_id = $1`,
    [session.data.companyId],
  )
  const row = rows[0]
  if (!row) return publicStorefrontSourceStatus()

  // Provisioning disables Vercel Authentication for new projects, but stores
  // created before that setting was added can still redirect the editor iframe
  // (and anyone opening the preview on another computer) to Vercel sign-in.
  // Repair the project on the editor's initial status request. Do not repeat
  // this PATCH during the three-second deployment polling loop.
  if (!refreshLatest && row.vercelProjectId) {
    try {
      await makeVercelStorefrontEmbeddable(
        useRuntimeConfig(event).vercelStorefront,
        row.vercelProjectId,
      )
    } catch (error) {
      // Status must remain readable even when Vercel is temporarily unavailable.
      console.error('[storefront-source] disabling Vercel Authentication failed', {
        companyId: session.data.companyId,
        error,
      })
    }
  }

  // The Vercel webhook is only a fast path. It cannot reach local.markit.co.in
  // and may occasionally be delayed in production, so the editor's active
  // build watcher explicitly asks for the latest preview deployment. Without
  // this, the row can keep the previous READY id until the UI's 180s fallback.
  if (refreshLatest && row.vercelProjectId) {
    try {
      const latest = await latestVercelDeployment(
        useRuntimeConfig(event).vercelStorefront,
        row.vercelProjectId,
        'preview',
      )
      if (latest) {
        row.previewDeploymentId = latest.id
        row.previewStatus = deploymentState(latest)
        row.previewUrl = deploymentUrl(latest) || row.previewUrl
        await pool.query(
          `UPDATE storefront_sources
           SET preview_deployment_id = $2, preview_deployment_url = $3,
               preview_deployment_status = $4, updated_at = NOW()
           WHERE company_id = $1`,
          [session.data.companyId, row.previewDeploymentId, row.previewUrl, row.previewStatus],
        )
      }
    } catch (error) {
      // Keep returning the stored state; the next 3-second editor poll retries.
      console.error('[storefront-source] latest preview refresh failed', {
        companyId: session.data.companyId,
        error,
      })
    }
  }

  if (
    row.previewDeploymentId
    && row.productionDeploymentId
    && (row.status === 'CREATING' || !row.previewBranchUrl || !row.productionUrl)
  ) {
    try {
      const runtime = useRuntimeConfig(event)
      const [preview, production] = await Promise.all([
        getVercelDeployment(runtime.vercelStorefront, row.previewDeploymentId),
        getVercelDeployment(runtime.vercelStorefront, row.productionDeploymentId),
      ])
      row.previewStatus = deploymentState(preview)
      row.productionStatus = deploymentState(production)
      row.previewUrl = deploymentUrl(preview) || row.previewUrl
      const failedStates = new Set(['ERROR', 'CANCELED'])
      let previewBranchUrl = row.previewBranchUrl
      let productionUrl = row.productionUrl
      if (row.previewStatus === 'READY' && !previewBranchUrl) {
        previewBranchUrl = stablePreviewUrl(
          await getVercelDeploymentAliases(runtime.vercelStorefront, row.previewDeploymentId),
        )
      }
      if (row.productionStatus === 'READY' && !productionUrl) {
        productionUrl = stableProductionUrl(
          await getVercelDeploymentAliases(runtime.vercelStorefront, row.productionDeploymentId),
        )
      }
      const status = failedStates.has(row.previewStatus) || failedStates.has(row.productionStatus)
        ? 'FAILED'
        : row.previewStatus === 'READY'
            && row.productionStatus === 'READY'
            && previewBranchUrl
            && productionUrl
          ? 'READY'
          : 'CREATING'
      await pool.query(
        `UPDATE storefront_sources
         SET status = $2, preview_deployment_url = $3, preview_deployment_status = $4,
             production_deployment_url = $5, production_deployment_status = $6,
             preview_branch_url = $7, production_url = $8,
             updated_at = NOW()
         WHERE company_id = $1`,
        [
          session.data.companyId,
          status,
          row.previewUrl,
          row.previewStatus,
          deploymentUrl(production),
          row.productionStatus,
          previewBranchUrl,
          productionUrl,
        ],
      )
      row.status = status
      row.previewBranchUrl = previewBranchUrl
      row.productionUrl = productionUrl
    } catch (error) {
      console.error('[storefront-source] deployment status refresh failed', {
        companyId: session.data.companyId,
        error,
      })
    }
  }

  return publicStorefrontSourceStatus(
    row.status,
    // Prefer the stable custom domain (preview-<name>.markit.co.in). It never
    // changes between builds, so the iframe can just refresh instead of being
    // pointed at a new per-deployment address each time.
    row.previewBranchUrl || row.previewUrl,
    row.previewStatus,
    row.productionStatus,
    row.previewDeploymentId,
  )
})
