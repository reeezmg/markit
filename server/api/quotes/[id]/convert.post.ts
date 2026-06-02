import { prisma } from '~/server/prisma'

type RetainFields = {
  customerNotes?: boolean
  termsAndConditions?: boolean
  address?: boolean
}

const buildRetainedText = (
  value: string | null | undefined,
  retain: boolean | undefined
) => retain === false ? null : value || null

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const quoteId = getRouterParam(event, 'id')
  const body = await readBody<{
    target?: 'invoice' | 'sales-order'
    markAccepted?: boolean
    retainFields?: RetainFields
  }>(event)

  if (!quoteId) {
    throw createError({ statusCode: 400, statusMessage: 'Quote id is required' })
  }

  if (body.target !== 'invoice' && body.target !== 'sales-order') {
    throw createError({ statusCode: 400, statusMessage: 'target must be invoice or sales-order' })
  }

  const companyId = session.data.companyId
  const retainFields = body.retainFields || {}

  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: { id: quoteId, companyId, deleted: false },
      include: { items: true },
    })

    if (!quote) {
      throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
    }

    if (quote.status !== 'ACCEPTED' && !body.markAccepted) {
      throw createError({
        statusCode: 409,
        statusMessage: 'QUOTE_ACCEPTANCE_REQUIRED',
        data: { needsAcceptance: true },
      })
    }

    if (quote.status !== 'ACCEPTED') {
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: 'ACCEPTED' },
      })
    }

    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: {
        salesOrderCounter: true,
        salesOrderPrefix: true,
        invoiceCounter: true,
        invoicePrefix: true,
      },
    })

    if (!company) {
      throw createError({ statusCode: 404, statusMessage: 'Company not found' })
    }

    const retainedNotes = buildRetainedText(quote.notes, retainFields.customerNotes)
    const retainedTerms = buildRetainedText(quote.termsAndConditions, retainFields.termsAndConditions)

    if (body.target === 'sales-order') {
      const orderNumber = `${company.salesOrderPrefix || 'SO'}-${String(company.salesOrderCounter).padStart(5, '0')}`
      const salesOrder = await tx.salesOrder.create({
        data: {
          orderNumber,
          referenceNumber: quote.referenceNumber,
          orderDate: new Date(),
          salesperson: quote.salesperson,
          status: 'CONFIRMED',
          notes: retainedNotes,
          termsAndConditions: retainedTerms,
          discount: quote.discount || 0,
          discountType: quote.discountType || 'amount',
          adjustment: quote.adjustment || 0,
          subTotal: quote.subTotal || 0,
          total: quote.total || 0,
          attachments: [],
          company: { connect: { id: companyId } },
          ...(quote.clientId ? { client: { connect: { id: quote.clientId } } } : {}),
          ...(quote.projectId ? { project: { connect: { id: quote.projectId } } } : {}),
          items: {
            create: quote.items.map((item, index) => ({
              serialNo: index + 1,
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
              unit: item.unit,
              ...(item.variantId ? { variant: { connect: { id: item.variantId } } } : {}),
            })),
          },
        },
      })

      await tx.company.update({
        where: { id: companyId },
        data: { salesOrderCounter: { increment: 1 } },
      })

      return {
        target: body.target,
        id: salesOrder.id,
        number: salesOrder.orderNumber,
        quoteStatus: 'ACCEPTED',
      }
    }

    const invoiceCode = `${company.invoicePrefix || 'INV'}-${String(company.invoiceCounter).padStart(6, '0')}`
    const invoice = await tx.bill.create({
      data: {
        invoiceCode,
        createdAt: new Date(),
        dueDate: new Date(),
        invoicePaymentTerms: 'Due on Receipt',
        salesperson: quote.salesperson,
        subject: quote.subject,
        paymentStatus: 'PENDING',
        notes: retainedNotes,
        termsAndConditions: retainedTerms,
        subtotal: quote.subTotal || 0,
        discount: quote.discount || 0,
        discountType: quote.discountType || 'amount',
        adjustment: quote.adjustment || 0,
        grandTotal: quote.total || 0,
        balanceDue: quote.total || 0,
        tax: 0,
        company: { connect: { id: companyId } },
        ...(quote.clientId ? { client: { connect: { id: quote.clientId } } } : {}),
        ...(quote.projectId ? { project: { connect: { id: quote.projectId } } } : {}),
        entries: {
          create: quote.items.map((item) => ({
            name: item.name,
            qty: item.quantity,
            rate: item.rate,
            value: item.amount,
            company: { connect: { id: companyId } },
            ...(item.variantId ? { variant: { connect: { id: item.variantId } } } : {}),
          })),
        },
      },
    })

    await tx.company.update({
      where: { id: companyId },
      data: { invoiceCounter: { increment: 1 } },
    })

    return {
      target: body.target,
      id: invoice.id,
      number: invoice.invoiceCode,
      quoteStatus: 'ACCEPTED',
    }
  })
})
