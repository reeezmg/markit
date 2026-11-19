import { afterSalesRoute } from '../../../utils/after-sales-route'
import { serviceProductList } from '../../../utils/after-sales'
export default afterSalesRoute(false, (db, company, _actor, query) => serviceProductList(db, company, query))
