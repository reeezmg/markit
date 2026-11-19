import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { readRecurringInvoice } from '../../utils/recurring-invoices'
export default invoiceProgramRoute(false, (db, ctx, _body, id) => readRecurringInvoice(db, ctx.companyId, id))

