import { afterSalesRoute } from '../../../utils/after-sales-route'
import { serviceProductDetail } from '../../../utils/after-sales'
export default afterSalesRoute(false, (db, company, _actor, query) => serviceProductDetail(db, company, query.id))
