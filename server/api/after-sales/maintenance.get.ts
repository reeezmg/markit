import { afterSalesRoute } from '../../utils/after-sales-route'
import { maintenanceList } from '../../utils/after-sales'
export default afterSalesRoute(false, (db, company, _actor, query) => maintenanceList(db, company, query))
