import { updateAiProvider } from '~/server/utils/aiProviders'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  return { provider: await updateAiProvider(session.data.companyId, getRouterParam(event, 'id') || '', await readBody(event), useRuntimeConfig(event)) }
})
