import { invoiceProgramRoute } from '../../../utils/invoice-program-route'
import { retainerAction } from '../../../utils/retainer-invoices'
export default invoiceProgramRoute(true, (db, ctx, body, id) => retainerAction(db, ctx, id, body))

