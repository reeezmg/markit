import { cleanupMediaKeys } from '~/server/utils/mediaCleanup'

/**
 * Removes uploaded media from R2 after the row that referenced it was deleted
 * or its image replaced.
 *
 * Keys that any row still points at are skipped, so this cannot be used to
 * knock out another company's live images — see server/utils/mediaCleanup.ts.
 */
export default defineEventHandler(async (event) => {
  await requireAuthSession(event)
  const body = await readBody<{ keys?: unknown }>(event)

  const keys = Array.isArray(body?.keys) ? body.keys : [body?.keys]
  const deleted = await cleanupMediaKeys(keys as string[])

  return { deleted, count: deleted.length }
})
