import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { saveRecurringInvoice } from '../../utils/recurring-invoices'
export default invoiceProgramRoute(true, (db, ctx, body) => saveRecurringInvoice(db, ctx, body))

