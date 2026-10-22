import { createTableReadinessCheck } from '~/server/utils/schemaReadiness'

export const ensureEcommProductReviewsTable = createTableReadinessCheck(
  ['ecomm_product_reviews'], 'Product reviews',
)
