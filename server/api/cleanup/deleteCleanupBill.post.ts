import { applyBillDeletionCleanup } from '~/server/utils/cleanUpDel'
import { applySoftBillDeletionCleanup } from '~/server/utils/cleanUpSoftDel'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (body.deleteType === 'soft') {
    return await applySoftBillDeletionCleanup(body)
  }
  return await applyBillDeletionCleanup(body)
})
