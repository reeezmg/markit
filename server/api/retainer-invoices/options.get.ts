import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { retainerOptions } from '../../utils/retainer-invoices'
export default invoiceProgramRoute(false, (db, ctx) => retainerOptions(db, ctx.companyId))

