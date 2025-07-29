import { applyBillDeletionCleanup } from '~/server/utils/cleanUpDel'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return await applyBillDeletionCleanup(body)
})
