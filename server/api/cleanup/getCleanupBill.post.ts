import { previewBillsForReduction } from '~/server/utils/cleanUpGet'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return await previewBillsForReduction(body)
})
