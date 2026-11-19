import { afterSalesRoute } from '../../utils/after-sales-route'
import { serviceStaffList } from '../../utils/after-sales'
export default afterSalesRoute(false, (db, company) => serviceStaffList(db, company))
