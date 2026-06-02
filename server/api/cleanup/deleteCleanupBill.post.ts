import { applyBillDeletionCleanup } from '~/server/utils/cleanUpDel'
import { applyBillReductionCleanup } from '~/server/utils/cleanUpReduce'
import { applySoftBillDeletionCleanup } from '~/server/utils/cleanUpSoftDel'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (body.deleteType === 'reduce') {
    return await applyBillReductionCleanup({
      companyId: body.companyId,
      reductions: body.reductionPlan || [],
    })
  }
  if (body.deleteType === 'soft') {
    return await applySoftBillDeletionCleanup(body)
  }
  return await applyBillDeletionCleanup(body)
})
