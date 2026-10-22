import { createTableReadinessCheck } from '~/server/utils/schemaReadiness'

// Contact inbox schema is defined in schema.zmodel. Status: new/opened/replied/closed.
export const ensureEcommContactMessagesTable = createTableReadinessCheck(
  ['ecomm_contact_messages'], 'Contact messages',
)
