import { afterSalesRoute } from '../../../utils/after-sales-route'
import { configurationList } from '../../../utils/after-sales'
export default afterSalesRoute(false, (db, company, _actor, query) => configurationList(db, company, query))
