import { listStorefrontAgentSessions } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  return listStorefrontAgentSessions(session.data.companyId)
})
