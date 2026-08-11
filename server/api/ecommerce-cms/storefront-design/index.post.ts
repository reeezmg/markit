import { startStorefrontInteraction } from '~/server/utils/storefrontAgent'
import { failDesignProfile, saveGeneratingDesignProfile } from '~/server/utils/storefrontDesign'

function field(value: unknown, label: string, max: number, required = false) {
  const text = String(value || '').trim()
  if ((required && !text) || text.length > max) throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  return text
}

export default defineEventHandler(async (event) => {
  const requestStartedAt = Date.now()
  const session = await requireAuthSession(event)
  const body = await readBody<any>(event)
  const companyDescription = field(body?.companyDescription, 'company description', 4000, true)
  const designDirection = field(body?.designDirection, 'design direction', 4000, true)
  const figmaUrl = field(body?.figmaUrl, 'Figma URL', 1000)
  const assetNotes = field(body?.assetNotes, 'asset notes', 4000)
  const notes = field(body?.notes, 'notes', 4000)
  const model = field(body?.model || 'gemini-3.1-pro', 'model', 80, true)
  if (!(/^[a-z0-9.\-]{1,40}$/.test(model) || /^byok:[0-9a-f-]{36}$/i.test(model))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid model' })
  }
  const images = Array.isArray(body?.images) ? body.images : []
  if (images.length > 4 || images.some((image: any) => !image?.mimeType?.startsWith('image/') || !image.data || image.data.length > 8_000_000)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid design reference image' })
  }
  const assets = Array.isArray(body?.assets) ? body.assets : []
  if (assets.length > 6 || assets.some((asset: any) =>
    !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(String(asset?.name || ''))
    || !asset?.data || asset.data.length > 2_100_000
    || String(asset?.mimeType || '').length > 120
  )) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid design asset' })
  }
  const conversationId = `design_${session.data.companyId}`
  await saveGeneratingDesignProfile(session.data.companyId, {
    companyDescription, designDirection, figmaUrl, assetNotes, notes, model, conversationId,
  })
  const prompt = `[MARKIT_INITIAL_DESIGN]
Create the storefront's canonical design system and apply it to the complete customer-facing project.

## Company and products
${companyDescription}

## Desired design
${designDirection}

## Figma reference
${figmaUrl || 'None supplied'}

## Logos, fonts and other assets
${assetNotes || 'None supplied'}
${assets.length ? `Uploaded files are available in .markit/design-inputs/: ${assets.map((asset: any) => asset.name).join(', ')}. Copy only the assets the storefront actually uses into the appropriate tracked public/source asset directory.` : ''}

## Other notes
${notes || 'None supplied'}

First inspect the entire storefront. Create .agents/skills/storefront-design/SKILL.md with the verified brand voice, colour tokens, typography scale and font usage, spacing, buttons, inputs, cards, borders/radii, shadows, imagery, icons, layout, responsive behaviour, accessibility rules and reusable component patterns. Then apply it consistently across every customer-facing route and shared component. Treat attached images as visual references. Do not invent facts about the company.`
  try {
    const result = await startStorefrontInteraction({
      runtime: useRuntimeConfig(event), companyId: session.data.companyId, conversationId,
      prompt, displayPrompt: 'Create and apply my storefront design system', model,
      images, assets, requestStartedAt,
    })
    return { ...result, status: 'GENERATING', conversationId }
  } catch (error) {
    await failDesignProfile(session.data.companyId, error)
    throw error
  }
})
