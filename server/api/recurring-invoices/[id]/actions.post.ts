import { invoiceProgramRoute } from '../../../utils/invoice-program-route'
import { recurringAction } from '../../../utils/recurring-invoices'
export default invoiceProgramRoute(true, (db, ctx, body, id) => recurringAction(db, ctx, id, body))

