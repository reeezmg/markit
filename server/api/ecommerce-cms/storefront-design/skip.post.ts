import { skipDesignProfile } from '~/server/utils/storefrontDesign'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  await skipDesignProfile(session.data.companyId)
  return { status: 'SKIPPED' as const }
})
