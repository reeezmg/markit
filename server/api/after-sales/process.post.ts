import { afterSalesRoute } from '../../utils/after-sales-route'
import { processServices } from '../../utils/after-sales'
export default afterSalesRoute(true, (db, company) => processServices(db, company))
