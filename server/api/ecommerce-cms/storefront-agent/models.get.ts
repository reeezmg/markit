/**
 * The AI models a seller can pick from, for the chat dropdown.
 *
 * Proxied from the edit sandbox orchestrator rather than hardcoded here, so
 * adding a model is a change in one place. Auth-gated like the other routes —
 * there is nothing secret in the list, but there is no reason to serve it
 * to anonymous callers either.
 */
export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)

  try {
    const builtIn = await orchestratorRequest<{
      default: string
      models: { key: string; label: string; note: string; family: string; supportsImages?: boolean }[]
    }>('/agent/models')
    const { listAiProviders } = await import('~/server/utils/aiProviders')
    const custom = await listAiProviders(session.data.companyId, true)
    return {
      ...builtIn,
      models: [
        ...builtIn.models,
        ...custom.map(item => ({
          key: `byok:${item.id}`,
          label: item.name,
          note: `${item.modelId}${item.supportsImages ? ' · reads images' : ''}`,
          family: item.provider,
          supportsImages: item.supportsImages,
        })),
      ],
    }
  } catch {
    /*
     * Never fail the chat screen over a dropdown. If the orchestrator is
     * unreachable, fall back to the default so the seller can still send a
     * message — it just won't offer alternatives.
     */
    return { default: 'qwen3-coder-480b', models: [] as { key: string; label: string; note: string; family: string; supportsImages?: boolean }[] }
  }
})
import { orchestratorRequest } from '~/server/utils/storefrontAgent'
