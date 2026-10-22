import { createTableReadinessCheck } from '~/server/utils/schemaReadiness'
import { pool } from '~/server/db'

export const ensureStorefrontDesignTable = createTableReadinessCheck(['storefront_design_profiles'], 'Storefront design')

export async function getStorefrontDesignProfile(companyId: string) {
  await ensureStorefrontDesignTable()
  const result = await pool.query(
    `SELECT status, company_description AS "companyDescription", design_direction AS "designDirection",
            figma_url AS "figmaUrl", asset_notes AS "assetNotes", notes, model,
            conversation_id AS "conversationId", error_message AS "errorMessage", updated_at AS "updatedAt"
       FROM storefront_design_profiles WHERE company_id=$1`,
    [companyId],
  )
  const profile = result.rows[0]
  if (!profile) return { status: 'NOT_CONFIGURED' as const }
  if (profile.status === 'GENERATING' && profile.conversationId) {
    const run = await pool.query(
      `SELECT status, reply FROM storefront_agent_sessions WHERE company_id=$1 AND conversation_id=$2`,
      [companyId, profile.conversationId],
    )
    const status = run.rows[0]?.status
    if (status === 'completed') {
      profile.status = 'READY'
      await pool.query(`UPDATE storefront_design_profiles SET status='READY', error_message=NULL, updated_at=NOW() WHERE company_id=$1`, [companyId])
    } else if (status === 'failed') {
      profile.status = 'FAILED'
      profile.errorMessage = run.rows[0]?.reply || 'The initial design run failed. You can retry it.'
      await pool.query(`UPDATE storefront_design_profiles SET status='FAILED', error_message=$2, updated_at=NOW() WHERE company_id=$1`, [companyId, profile.errorMessage])
    }
  }
  return profile
}

export async function saveGeneratingDesignProfile(companyId: string, input: Record<string, string>) {
  await ensureStorefrontDesignTable()
  await pool.query(
    `INSERT INTO storefront_design_profiles
       (company_id, status, company_description, design_direction, figma_url, asset_notes, notes, model, conversation_id, error_message)
     VALUES ($1,'GENERATING',$2,$3,$4,$5,$6,$7,$8,NULL)
     ON CONFLICT (company_id) DO UPDATE SET
       status='GENERATING', company_description=$2, design_direction=$3, figma_url=$4,
       asset_notes=$5, notes=$6, model=$7, conversation_id=$8, error_message=NULL, updated_at=NOW()`,
    [companyId, input.companyDescription, input.designDirection, input.figmaUrl || null,
      input.assetNotes || null, input.notes || null, input.model, input.conversationId],
  )
}

/**
 * Let the seller into the editor without a generated design skill. Any answers
 * they already typed are kept, so re-opening the form later starts from them.
 */
export async function skipDesignProfile(companyId: string) {
  await ensureStorefrontDesignTable()
  await pool.query(
    `INSERT INTO storefront_design_profiles (company_id, status)
     VALUES ($1,'SKIPPED')
     ON CONFLICT (company_id) DO UPDATE SET status='SKIPPED', error_message=NULL, updated_at=NOW()`,
    [companyId],
  )
}

export async function failDesignProfile(companyId: string, error: unknown) {
  await ensureStorefrontDesignTable()
  await pool.query(
    `UPDATE storefront_design_profiles SET status='FAILED', error_message=$2, updated_at=NOW() WHERE company_id=$1`,
    [companyId, String((error as any)?.message || error).slice(0, 1000)],
  )
}
