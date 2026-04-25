import crypto from 'crypto'
import { prisma } from '~/server/prisma'
import {
  buildContentsFromHistory,
  getGeminiToolsAndClient,
  loadChatHistory,
  normalizePhoneDigits,
  persistMessages,
  runAgenticLoop,
  WHATSAPP_SESSION_TTL_MS,
} from '~/server/utils/aiChat'
import { uploadToR2 } from '~/server/utils/r2'

interface CompanyUserMatch {
  companyId: string
  userId: string
  companyName: string
  userName: string | null
  phone: string | null
}

interface WhatsAppInboundInput {
  phone: string
  text?: string
}

interface WhatsAppMediaAsset {
  data: string
  mimeType: string
  name?: string
  type: 'voice' | 'image' | 'file'
  size?: number
  duration?: number
}

interface WhatsAppMediaInboundInput {
  phone: string
  mediaId: string
  kind?: 'image' | 'audio' | 'document' | 'video'
  mimeType?: string
  name?: string
  caption?: string
  duration?: number
}

interface WhatsAppInboundResult {
  reply: string
  chatId?: string
}

interface WhatsAppChatSession {
  id: string
  sessionStatus: string
  expiresAt: Date | null
  sessionStartedAt: Date | null
  companyId: string | null
  userId: string | null
}

const WHATSAPP_MEDIA_EXT_MAP: Record<string, string> = {
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

function isSessionCommand(text: string): boolean {
  return /^(logout|log out|end session|end chat|switch company|switch account)$/i.test(text.trim())
}

function buildSelectionPrompt(matches: CompanyUserMatch[]): string {
  const lines = matches.map((match, index) => {
    const suffix = match.userName ? ` (${match.userName})` : ''
    return `${index + 1}. ${match.companyName}${suffix}`
  })

  return [
    'I found this WhatsApp number linked to multiple companies:',
    ...lines,
    'Reply with the number or the company name you want to use.',
  ].join('\n')
}

function resolveSelection(text: string, matches: CompanyUserMatch[]): CompanyUserMatch | null {
  const trimmed = text.trim()
  const selectionNumber = Number.parseInt(trimmed, 10)
  if (Number.isInteger(selectionNumber) && selectionNumber >= 1 && selectionNumber <= matches.length) {
    return matches[selectionNumber - 1] ?? null
  }

  const lower = trimmed.toLowerCase()
  if (!lower) return null

  return (
    matches.find((match) => match.companyName.toLowerCase() === lower) ||
    matches.find((match) => match.companyName.toLowerCase().includes(lower)) ||
    matches.find((match) => (match.userName ?? '').toLowerCase() === lower) ||
    matches.find((match) => (match.userName ?? '').toLowerCase().includes(lower)) ||
    null
  )
}

function getMediaType(mimeType: string): 'voice' | 'image' | 'file' {
  if (mimeType.startsWith('audio/')) return 'voice'
  if (mimeType.startsWith('image/')) return 'image'
  return 'file'
}

function getMediaInstruction(kind: 'voice' | 'image' | 'file'): string {
  if (kind === 'voice') {
    return 'Listen to this audio carefully and respond to exactly what the user said. If you cannot understand it, ask them to repeat.'
  }
  if (kind === 'image') {
    return 'Describe what you see in this image and help the user with it.'
  }
  return 'Analyze this file and help the user with it.'
}

function inferWhatsAppMediaKind(
  kind: WhatsAppMediaInboundInput['kind'] | undefined,
  mimeType: string,
): 'voice' | 'image' | 'file' {
  if (kind === 'audio') return 'voice'
  if (kind === 'image') return 'image'
  if (kind === 'document' || kind === 'video') return 'file'
  return getMediaType(mimeType)
}

function inferWhatsAppMimeType(
  kind: WhatsAppMediaInboundInput['kind'] | undefined,
  mimeType: string | undefined,
): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  if (kind === 'audio') return 'audio/ogg'
  if (kind === 'image') return 'image/jpeg'
  if (kind === 'document') return 'application/pdf'
  if (kind === 'video') return 'video/mp4'
  return mimeType || 'application/octet-stream'
}

function getUserLabel(kind: 'voice' | 'image' | 'file', caption?: string, name?: string): string {
  const trimmedCaption = caption?.trim()
  if (trimmedCaption) return trimmedCaption.slice(0, 80)
  if (kind === 'voice') return '[Voice message]'
  if (kind === 'image') return '[Image]'
  return name ? `[File: ${name}]` : '[File]'
}

function getWhatsAppMediaAttachmentType(mimeType: string): 'voice' | 'image' | 'file' {
  return getMediaType(mimeType)
}

function getWhatsAppMediaKey(companyId: string, mimeType: string): string {
  const ext = WHATSAPP_MEDIA_EXT_MAP[mimeType] || ''
  return `ai-chat/${companyId}/${crypto.randomUUID()}${ext}`
}

async function fetchWhatsAppMedia(mediaId: string): Promise<{ data: string; mimeType: string; name?: string }> {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) throw new Error('WHATSAPP_TOKEN not configured')

  const metaResponse = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!metaResponse.ok) {
    throw new Error(`Failed to resolve WhatsApp media ${mediaId}: ${metaResponse.status} ${metaResponse.statusText}`)
  }

  const meta = await metaResponse.json() as { url?: string; mime_type?: string; filename?: string }
  if (!meta.url) {
    throw new Error(`WhatsApp media ${mediaId} did not return a download URL`)
  }

  const fileResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!fileResponse.ok) {
    throw new Error(`Failed to download WhatsApp media ${mediaId}: ${fileResponse.status} ${fileResponse.statusText}`)
  }

  const bytes = Buffer.from(await fileResponse.arrayBuffer())
  return {
    data: bytes.toString('base64'),
    mimeType: meta.mime_type || 'application/octet-stream',
    name: meta.filename,
  }
}

async function uploadWhatsAppMediaToR2(companyId: string, asset: WhatsAppMediaAsset): Promise<{ url: string; type: 'voice' | 'image' | 'file'; name?: string; mimeType: string; size?: number; duration?: number }> {
  const key = getWhatsAppMediaKey(companyId, asset.mimeType)
  const url = await uploadToR2(asset.data, key, asset.mimeType)
  return {
    url,
    type: getWhatsAppMediaAttachmentType(asset.mimeType),
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    duration: asset.duration,
  }
}

async function findCompanyMatchesByPhone(phoneDigits: string): Promise<CompanyUserMatch[]> {
  const rows = await prisma.$queryRaw<Array<CompanyUserMatch>>`
    SELECT
      cu.company_id AS "companyId",
      cu.user_id AS "userId",
      cu.name AS "userName",
      cu.phone AS "phone",
      c.name AS "companyName"
    FROM company_users cu
    INNER JOIN companies c ON c.id = cu.company_id
    WHERE cu.deleted = false
      AND cu.status = true
      AND (
        regexp_replace(COALESCE(cu.phone, ''), '[^0-9]', '', 'g') = ${phoneDigits}
        OR RIGHT(regexp_replace(COALESCE(cu.phone, ''), '[^0-9]', '', 'g'), 10) = RIGHT(${phoneDigits}, 10)
      )
    ORDER BY c.name ASC, cu.name ASC
  `

  const unique = new Map<string, CompanyUserMatch>()
  for (const row of rows) {
    if (!unique.has(row.companyId)) {
      unique.set(row.companyId, row)
    }
  }

  return [...unique.values()]
}

async function findLatestWhatsAppChat(phoneDigits: string): Promise<WhatsAppChatSession | null> {
  return prisma.aiChat.findFirst({
    where: { channel: 'WHATSAPP', sourcePhone: phoneDigits },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      sessionStatus: true,
      expiresAt: true,
      sessionStartedAt: true,
      companyId: true,
      userId: true,
    },
  })
}

async function expireWhatsAppChat(chatId: string) {
  await prisma.aiChat.update({
    where: { id: chatId },
    data: {
      sessionStatus: 'EXPIRED',
      expiresAt: new Date(),
      lastSeenAt: new Date(),
    },
  })
}

function buildAuthenticatedReply(match: CompanyUserMatch): string {
  return `Authenticated as ${match.companyName}${match.userName ? ` (${match.userName})` : ''}. Send your request.`
}

async function runWhatsAppConversation(opts: {
  chatId: string
  sourcePhone: string
  companyId: string
  userId: string
  now: Date
  expiresAt: Date
  sessionStartedAt?: Date | null
  userMessage: string
  userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
  attachments?: unknown[]
}): Promise<WhatsAppInboundResult> {
  const history = await loadChatHistory(opts.chatId, opts.sessionStartedAt)
  const contents = buildContentsFromHistory(history)
  contents.push({ role: 'user', parts: opts.userParts })

  const { mcpClient, geminiTools } = await getGeminiToolsAndClient()
  const { reply, toolCalls } = await runAgenticLoop({
    contents,
    geminiTools,
    mcpClient,
    companyId: opts.companyId,
    userId: opts.userId,
  })

  await persistMessages({
    chatId: opts.chatId,
    channel: 'WHATSAPP',
    sourcePhone: opts.sourcePhone,
    sessionStatus: 'ACTIVE',
    companyId: opts.companyId,
    userId: opts.userId,
    lastSeenAt: opts.now,
    expiresAt: opts.expiresAt,
    userMessage: opts.userMessage,
    assistantMessage: reply,
    toolCalls,
    attachments: opts.attachments,
  })

  return { reply, chatId: opts.chatId }
}

export async function handleWhatsAppInbound(input: WhatsAppInboundInput): Promise<WhatsAppInboundResult> {
  const sourcePhone = normalizePhoneDigits(input.phone)
  const incomingText = (input.text ?? '').trim()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + WHATSAPP_SESSION_TTL_MS)

  const latestChat = await findLatestWhatsAppChat(sourcePhone)
  const chatExpired = latestChat?.expiresAt ? latestChat.expiresAt <= now : false

  if (latestChat && (latestChat.sessionStatus === 'EXPIRED' || chatExpired)) {
    await expireWhatsAppChat(latestChat.id)
  }

  const activeChat = latestChat && !chatExpired && latestChat.sessionStatus !== 'EXPIRED' ? latestChat : null

  if (isSessionCommand(incomingText)) {
    if (activeChat) {
      await persistMessages({
        chatId: activeChat.id,
        channel: 'WHATSAPP',
        sourcePhone,
        sessionStatus: 'EXPIRED',
        lastSeenAt: now,
        expiresAt: now,
        userMessage: incomingText,
        assistantMessage: 'Your WhatsApp session has been ended. Send a new message to start again.',
      })
      await expireWhatsAppChat(activeChat.id)
    }

    return {
      reply: 'Your WhatsApp session has been ended. Send a new message to start again.',
      chatId: activeChat?.id,
    }
  }

  const matches = await findCompanyMatchesByPhone(sourcePhone)

  if (!matches.length) {
    return {
      reply: 'This WhatsApp number is not linked to any company user. Please contact your administrator.',
    }
  }

  if (activeChat?.sessionStatus === 'PENDING_COMPANY_SELECT' && activeChat.expiresAt && activeChat.expiresAt > now) {
    const selection = resolveSelection(incomingText, matches)
    if (!selection) {
      const prompt = buildSelectionPrompt(matches)
      await persistMessages({
        chatId: activeChat.id,
        channel: 'WHATSAPP',
        sourcePhone,
        sessionStatus: 'PENDING_COMPANY_SELECT',
        lastSeenAt: now,
        expiresAt,
        userMessage: incomingText || '[Company selection pending]',
        assistantMessage: prompt,
      })

      return { reply: prompt, chatId: activeChat.id }
    }

    const confirmation = buildAuthenticatedReply(selection)
    await persistMessages({
      chatId: activeChat.id,
      channel: 'WHATSAPP',
      sourcePhone,
      sessionStatus: 'PENDING_COMPANY_SELECT',
      lastSeenAt: now,
      expiresAt,
      userMessage: incomingText,
      assistantMessage: confirmation,
    })

    await prisma.aiChat.update({
      where: { id: activeChat.id },
      data: {
        companyId: selection.companyId,
        userId: selection.userId,
        sessionStatus: 'ACTIVE',
        sessionStartedAt: now,
        lastSeenAt: now,
        expiresAt,
        title: `WhatsApp - ${selection.companyName}`,
      },
    })

    return { reply: confirmation, chatId: activeChat.id }
  }

  if (activeChat?.sessionStatus === 'ACTIVE' && activeChat.companyId && activeChat.userId && !chatExpired) {
    return runWhatsAppConversation({
      chatId: activeChat.id,
      sourcePhone,
      companyId: activeChat.companyId,
      userId: activeChat.userId,
      now,
      expiresAt,
      sessionStartedAt: activeChat.sessionStartedAt,
      userMessage: incomingText,
      userParts: [{ text: incomingText }],
    })
  }

  if (matches.length === 1) {
    const match = matches[0]
    const chatId = await persistMessages({
      channel: 'WHATSAPP',
      sourcePhone,
      sessionStatus: 'ACTIVE',
      sessionStartedAt: now,
      lastSeenAt: now,
      expiresAt,
      companyId: match.companyId,
      userId: match.userId,
      title: `WhatsApp - ${match.companyName}`,
    })

    return runWhatsAppConversation({
      chatId,
      sourcePhone,
      companyId: match.companyId,
      userId: match.userId,
      now,
      expiresAt,
      sessionStartedAt: now,
      userMessage: incomingText,
      userParts: [{ text: incomingText }],
    })
  }

  if (!activeChat || activeChat.sessionStatus === 'EXPIRED' || chatExpired) {
    const prompt = buildSelectionPrompt(matches)
    const chatId = await persistMessages({
      channel: 'WHATSAPP',
      sourcePhone,
      sessionStatus: 'PENDING_COMPANY_SELECT',
      lastSeenAt: now,
      expiresAt,
      title: `WhatsApp - ${sourcePhone || 'Unknown'}`,
      userMessage: incomingText,
      assistantMessage: prompt,
    })

    return { reply: prompt, chatId }
  }

  // If we reached here, there is an active chat that is missing binding details.
  const prompt = buildSelectionPrompt(matches)
  const chatId = await persistMessages({
    chatId: activeChat.id,
    channel: 'WHATSAPP',
    sourcePhone,
    sessionStatus: 'PENDING_COMPANY_SELECT',
    lastSeenAt: now,
    expiresAt,
    userMessage: incomingText || '[Company selection pending]',
    assistantMessage: prompt,
  })

  return { reply: prompt, chatId }
}

export async function handleWhatsAppMediaInbound(input: WhatsAppMediaInboundInput): Promise<WhatsAppInboundResult> {
  const sourcePhone = normalizePhoneDigits(input.phone)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + WHATSAPP_SESSION_TTL_MS)
  const pendingKind = input.kind === 'audio' ? 'voice' : input.kind === 'image' ? 'image' : 'file'

  const latestChat = await findLatestWhatsAppChat(sourcePhone)
  const chatExpired = latestChat?.expiresAt ? latestChat.expiresAt <= now : false

  if (latestChat && (latestChat.sessionStatus === 'EXPIRED' || chatExpired)) {
    await expireWhatsAppChat(latestChat.id)
  }

  const activeChat = latestChat && !chatExpired && latestChat.sessionStatus !== 'EXPIRED' ? latestChat : null
  const matches = await findCompanyMatchesByPhone(sourcePhone)

  if (!matches.length) {
    return {
      reply: 'This WhatsApp number is not linked to any company user. Please contact your administrator.',
    }
  }

  if (activeChat?.sessionStatus === 'PENDING_COMPANY_SELECT' && activeChat.expiresAt && activeChat.expiresAt > now) {
    const prompt = buildSelectionPrompt(matches)
    await persistMessages({
      chatId: activeChat.id,
      channel: 'WHATSAPP',
      sourcePhone,
      sessionStatus: 'PENDING_COMPANY_SELECT',
      lastSeenAt: now,
      expiresAt,
      userMessage: getUserLabel(pendingKind, input.caption, input.name),
      assistantMessage: prompt,
    })

    return { reply: prompt, chatId: activeChat.id }
  }

  if (activeChat?.sessionStatus === 'ACTIVE' && activeChat.companyId && activeChat.userId && !chatExpired) {
    const media = await fetchWhatsAppMedia(input.mediaId)
    const mimeType = inferWhatsAppMimeType(input.kind, input.mimeType || media.mimeType)
    const kind = inferWhatsAppMediaKind(input.kind, mimeType)
    const asset: WhatsAppMediaAsset = {
      data: media.data,
      mimeType,
      name: input.name || media.name,
      type: kind,
      duration: input.duration,
    }
    const attachment = await uploadWhatsAppMediaToR2(activeChat.companyId, asset)
    const instruction = input.caption?.trim() || getMediaInstruction(kind)
    const userMessage = getUserLabel(kind, input.caption, asset.name)
    const userParts = [
      { inlineData: { mimeType: asset.mimeType, data: asset.data } },
      { text: instruction },
    ]

    return runWhatsAppConversation({
      chatId: activeChat.id,
      sourcePhone,
      companyId: activeChat.companyId,
      userId: activeChat.userId,
      now,
      expiresAt,
      sessionStartedAt: activeChat.sessionStartedAt,
      userMessage,
      userParts,
      attachments: [attachment],
    })
  }

  if (matches.length === 1) {
    const media = await fetchWhatsAppMedia(input.mediaId)
    const mimeType = inferWhatsAppMimeType(input.kind, input.mimeType || media.mimeType)
    const kind = inferWhatsAppMediaKind(input.kind, mimeType)
    const asset: WhatsAppMediaAsset = {
      data: media.data,
      mimeType,
      name: input.name || media.name,
      type: kind,
      duration: input.duration,
    }
    const attachment = await uploadWhatsAppMediaToR2(matches[0].companyId, asset)
    const instruction = input.caption?.trim() || getMediaInstruction(kind)
    const userMessage = getUserLabel(kind, input.caption, asset.name)
    const userParts = [
      { inlineData: { mimeType: asset.mimeType, data: asset.data } },
      { text: instruction },
    ]

    const match = matches[0]
    const chatId = await persistMessages({
      channel: 'WHATSAPP',
      sourcePhone,
      sessionStatus: 'ACTIVE',
      sessionStartedAt: now,
      lastSeenAt: now,
      expiresAt,
      companyId: match.companyId,
      userId: match.userId,
      title: `WhatsApp - ${match.companyName}`,
    })

    return runWhatsAppConversation({
      chatId,
      sourcePhone,
      companyId: match.companyId,
      userId: match.userId,
      now,
      expiresAt,
      sessionStartedAt: now,
      userMessage,
      userParts,
      attachments: [attachment],
    })
  }

  const prompt = buildSelectionPrompt(matches)
  const chatId = await persistMessages({
    channel: 'WHATSAPP',
    sourcePhone,
    sessionStatus: 'PENDING_COMPANY_SELECT',
    lastSeenAt: now,
    expiresAt,
    title: `WhatsApp - ${sourcePhone || 'Unknown'}`,
    userMessage: getUserLabel(pendingKind, input.caption, input.name),
    assistantMessage: prompt,
  })

  return { reply: prompt, chatId }
}
