import { afterSalesRoute } from '../../../utils/after-sales-route'
import { saveServiceJob } from '../../../utils/after-sales'
export default afterSalesRoute(true, saveServiceJob)
