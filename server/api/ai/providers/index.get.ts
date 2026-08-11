import { listAiProviders } from '~/server/utils/aiProviders'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  return { providers: await listAiProviders(session.data.companyId) }
})
