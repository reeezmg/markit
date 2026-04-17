import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import {
  type ChatMessage,
  getGeminiToolsAndClient,
  buildContentsFromHistory,
  runAgenticLoop,
  persistMessages,
  getReportSystemPrompt,
} from '~/server/utils/aiChat'
import { uploadToR2 } from '~/server/utils/r2'

interface MediaItem {
  data: string     // base64
  mimeType: string // e.g. 'audio/webm', 'image/jpeg', 'application/pdf'
  name?: string    // original filename
}

interface UploadedMedia {
  url: string
  type: 'voice' | 'image' | 'file'
  name?: string
  mimeType: string
}

const EXT_MAP: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
}

function getMediaType(mimeType: string): 'voice' | 'image' | 'file' {
  if (mimeType.startsWith('audio/')) return 'voice'
  if (mimeType.startsWith('image/')) return 'image'
  return 'file'
}

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  const userId = session.data?.id as string | undefined

  if (!companyId || !userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody<{
    media: MediaItem[]
    text?: string
    history: ChatMessage[]
    chatId?: string
  }>(event)

  if (!body?.media?.length) {
    throw createError({ statusCode: 400, statusMessage: 'media is required' })
  }

  let chatId = body.chatId
  const history = body.history ?? []

  // Upload media to R2 and collect URLs
  const uploaded: UploadedMedia[] = []
  for (const m of body.media) {
    const ext = EXT_MAP[m.mimeType] || ''
    const key = `ai-chat/${companyId}/${crypto.randomUUID()}${ext}`
    const url = await uploadToR2(m.data, key, m.mimeType)
    uploaded.push({
      url,
      type: getMediaType(m.mimeType),
      name: m.name,
      mimeType: m.mimeType,
    })
  }

  // Detect @report agent prefix in text
  const isReport = (body.text ?? '').trimStart().toLowerCase().startsWith('@report')
  const cleanup = (session.data as any)?.cleanup ?? false
  const isTaxIncluded = (session.data as any)?.isTaxIncluded ?? true

  // Build Gemini request
  const { mcpClient, geminiTools } = await getGeminiToolsAndClient(isReport ? 'report' : undefined)
  const contents = buildContentsFromHistory(history)

  // Build user message parts: all media items + optional text
  const parts: any[] = body.media.map((m) => ({
    inlineData: { mimeType: m.mimeType, data: m.data },
  }))

  if (body.text) {
    // Strip @report prefix from the text sent to Gemini
    parts.push({ text: isReport ? body.text.replace(/^@report\s*/i, '') : body.text })
  } else {
    const firstType = body.media[0].mimeType
    if (firstType.startsWith('audio/')) {
      parts.push({ text: 'Listen to this audio carefully and respond to exactly what the user said. If you cannot understand it, ask them to repeat.' })
    } else if (firstType.startsWith('image/')) {
      parts.push({ text: 'Describe what you see in this image and help the user with it.' })
    } else {
      parts.push({ text: 'Analyze this file and help the user with it.' })
    }
  }

  contents.push({ role: 'user', parts })

  const { reply, toolCalls } = await runAgenticLoop({
    contents,
    geminiTools,
    mcpClient,
    companyId,
    userId,
    systemPrompt: isReport ? getReportSystemPrompt() : undefined,
    cleanup,
    isTaxIncluded,
  })

  // Determine user message label for persistence
  const firstType = body.media[0].mimeType
  let userLabel = '[File]'
  if (firstType.startsWith('audio/')) userLabel = '[Voice message]'
  else if (firstType.startsWith('image/')) userLabel = '[Image]'
  if (body.text && body.text !== 'Respond to what the user said in the audio above.') {
    userLabel = body.text.slice(0, 80)
  }

  // Build attachment metadata for DB (without base64)
  const attachmentMeta = uploaded.map((u) => ({
    type: u.type,
    url: u.url,
    name: u.name,
    mimeType: u.mimeType,
  }))

  chatId = await persistMessages(chatId, companyId, userId, userLabel, reply, toolCalls, attachmentMeta)

  return { reply, toolCalls, chatId, uploaded }
})
