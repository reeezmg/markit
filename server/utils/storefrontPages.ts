import { createTableReadinessCheck } from '~/server/utils/schemaReadiness'

export const ensureStorefrontPagesTable = createTableReadinessCheck(['storefront_pages'], 'Storefront pages')
