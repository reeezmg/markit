import { deleteAiProvider } from '~/server/utils/aiProviders'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  await deleteAiProvider(session.data.companyId, getRouterParam(event, 'id') || '')
  return { ok: true }
})
