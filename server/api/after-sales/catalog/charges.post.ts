import { afterSalesRoute } from '../../../utils/after-sales-route'
import { saveServiceCharge } from '../../../utils/after-sales-catalog'
export default afterSalesRoute(true, saveServiceCharge)
