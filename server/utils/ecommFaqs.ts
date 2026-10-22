import { createTableReadinessCheck } from '~/server/utils/schemaReadiness'

export const ensureEcommCmsTables = createTableReadinessCheck(
  ['ecomm_faqs', 'ecomm_feedback', 'ecomm_blogs'], 'Storefront content',
)

export const ensureEcommFaqsTable = ensureEcommCmsTables
export const ensureEcommFeedbackTable = ensureEcommCmsTables
export const ensureEcommBlogsTable = ensureEcommCmsTables
