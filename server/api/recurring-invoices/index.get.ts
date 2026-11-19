import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { listRecurringInvoices } from '../../utils/recurring-invoices'
export default invoiceProgramRoute(false, async (db, ctx, query) => ({ rows: await listRecurringInvoices(db, ctx.companyId, query.q, query.status) }))

