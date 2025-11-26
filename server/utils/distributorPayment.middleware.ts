import type { Prisma } from '@prisma/client'
import { prisma } from '~/server/prisma' // adjust path if needed

const distributorPaymentMiddleware: Prisma.Middleware = async (params, next) => {
  if (
    params.model === 'DistributorPayment' &&
    (params.action === 'create' || params.action === 'update' || params.action === 'delete')
  ) {
    console.log(params)
    // First execute the operation
    const result = await next(params)

    // Get purchaseOrderId from different possible locations
    let purchaseOrderId: string | undefined
    
    if (params.action === 'create') {
      purchaseOrderId = params.args.data?.purchaseOrder?.connect?.id || 
                         params.args.data?.purchaseOrderId
    } else if (params.action === 'update') {
      purchaseOrderId = params.args.data?.purchaseOrder?.connect?.id || 
                         params.args.data?.purchaseOrderId || 
                         result?.purchaseOrderId
    } else if (params.action === 'delete') {
      purchaseOrderId = params.args?.where?.purchaseOrderId || 
                        result?.purchaseOrderId
    }

    if (purchaseOrderId) {
      // Get all payments for this PO
      const payments = await prisma.distributorPayment.findMany({
        where: { purchaseOrderId },
      })

      // Calculate total paid amount
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)

      // Update the purchase order
      await prisma.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { paidAmount: totalPaid },
      })
    }

    return result
  }

  return next(params)
}

export default distributorPaymentMiddleware