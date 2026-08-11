import { getStorefrontDesignProfile } from '~/server/utils/storefrontDesign'
import { getStorefrontInteraction } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  let profile = await getStorefrontDesignProfile(session.data.companyId)
  if (profile.status === 'GENERATING' && 'conversationId' in profile && profile.conversationId) {
    await getStorefrontInteraction({
      runtime: useRuntimeConfig(event), companyId: session.data.companyId, conversationId: profile.conversationId,
    }).catch(() => null)
    profile = await getStorefrontDesignProfile(session.data.companyId)
  }
  return profile
})
