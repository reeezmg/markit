import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { saveRetainer } from '../../utils/retainer-invoices'
export default invoiceProgramRoute(true, (db, ctx, body, id) => saveRetainer(db, ctx, body, id))

