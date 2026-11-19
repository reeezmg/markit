import { afterSalesRoute } from '../../../utils/after-sales-route'
import { previewConfiguration } from '../../../utils/after-sales'
export default afterSalesRoute(false, async (db, company, _actor, query) => previewConfiguration(db, company, query))
