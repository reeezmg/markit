import { createAiProvider } from '~/server/utils/aiProviders'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  return { provider: await createAiProvider(session.data.companyId, await readBody(event), useRuntimeConfig(event)) }
})
