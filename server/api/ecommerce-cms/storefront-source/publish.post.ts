import { pool } from '~/server/db'
import {
  deploymentState,
  deploymentUrl,
  latestVercelDeployment,
} from '~/server/utils/vercelStorefront'
import {
  ensureStorefrontSourcesTable,
  publishStorefrontPreview,
} from '~/server/utils/storefrontSource'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const companyId = session.data.companyId
  const runtime = useRuntimeConfig(event)
  await ensureStorefrontSourcesTable()

  const { rows } = await pool.query<{
    repositoryFullName: string | null
    vercelProjectId: string | null
    status: string
  }>(
    `SELECT repository_full_name AS "repositoryFullName",
            vercel_project_id AS "vercelProjectId", status
       FROM storefront_sources WHERE company_id=$1`,
    [companyId],
  )
  const source = rows[0]
  if (!source?.repositoryFullName || source.status !== 'READY') {
    throw createError({ statusCode: 409, statusMessage: 'Storefront setup is not ready' })
  }

  try {
    const result = await publishStorefrontPreview(runtime.githubStorefront, source.repositoryFullName)
    if (!result.published) {
      return { published: false, message: 'Your live storefront is already up to date.' }
    }

    // A main-branch push starts Vercel automatically. Record the deployment if
    // GitHub/Vercel has registered it already; the webhook can fill it later.
    if (source.vercelProjectId) {
      const deployment = await latestVercelDeployment(
        runtime.vercelStorefront,
        source.vercelProjectId,
        'main',
      ).catch(() => null)
      if (deployment) {
        await pool.query(
          `UPDATE storefront_sources
              SET production_deployment_id=$2, production_deployment_url=$3,
                  production_deployment_status=$4, updated_at=NOW()
            WHERE company_id=$1`,
          [companyId, deployment.id, deploymentUrl(deployment), deploymentState(deployment)],
        )
      }
    }
    return { published: true, message: 'Storefront published successfully.' }
  } catch (error: any) {
    throw createError({
      statusCode: Number(error?.statusCode) || 500,
      statusMessage: error?.message || 'Unable to publish storefront',
    })
  }
})
