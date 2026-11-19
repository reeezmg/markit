import { afterSalesRoute } from '../../../utils/after-sales-route'
import { serviceCatalog } from '../../../utils/after-sales-catalog'
export default afterSalesRoute(false, (db, companyId, _actor, input) => serviceCatalog(db, companyId, input))
