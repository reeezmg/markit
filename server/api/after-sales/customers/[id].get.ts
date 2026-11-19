import { afterSalesRoute } from '../../../utils/after-sales-route'
import { customerServiceHistory } from '../../../utils/after-sales-customer-history'
export default afterSalesRoute(false, (db, company, _actor, input) => customerServiceHistory(db, company, input))
