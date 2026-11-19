import { invoiceProgramRoute } from '../../utils/invoice-program-route'
import { listRetainers } from '../../utils/retainer-invoices'
export default invoiceProgramRoute(false, async (db, ctx, query) => ({ rows: await listRetainers(db, ctx.companyId, query.q, query.status) }))

