import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { saveRecurringInvoice } from '../../utils/recurring-invoices'
export default invoiceProgramRoute(true, (db, ctx, body, id) => saveRecurringInvoice(db, ctx, body, id))

