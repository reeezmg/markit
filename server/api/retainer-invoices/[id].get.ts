import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { readRetainer } from '../../utils/retainer-invoices'
export default invoiceProgramRoute(false, (db, ctx, _body, id) => readRetainer(db, ctx.companyId, id))

