import { afterSalesRoute } from '../../../utils/after-sales-route'
import { serviceJobList } from '../../../utils/after-sales'
export default afterSalesRoute(false, (db, company, _actor, input) => serviceJobList(db, company, input))
