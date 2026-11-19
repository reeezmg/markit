import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { saveRetainer } from '../../utils/retainer-invoices'
export default invoiceProgramRoute(true, (db, ctx, body) => saveRetainer(db, ctx, body))

