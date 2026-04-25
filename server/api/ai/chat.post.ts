import { defineEventHandler, readBody, createError } from 'h3'
import {
  type ChatMessage,
  getGeminiToolsAndClient,
  buildContentsFromHistory,
  runAgenticLoop,
  persistMessages,
  getReportSystemPrompt,
  getSettingSystemPrompt,
} from '~/server/utils/aiChat'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  const userId = session.data?.id as string | undefined

  if (!companyId || !userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody<{ messages: ChatMessage[]; chatId?: string }>(event)
  if (!body?.messages?.length) {
    throw createError({ statusCode: 400, statusMessage: 'messages is required' })
  }

  let chatId = body.chatId
  const userMessage = body.messages[body.messages.length - 1]?.content ?? ''

  // Detect @report / @setting agent prefix
  const trimmed = userMessage.trimStart().toLowerCase()
  const isReport = trimmed.startsWith('@report')
  const isSetting = trimmed.startsWith('@setting')
  const toolFilter = isReport ? 'report' : isSetting ? 'setting' : undefined
  const cleanup = (session.data as any)?.cleanup ?? false
  const isTaxIncluded = (session.data as any)?.isTaxIncluded ?? true

  const { mcpClient, geminiTools } = await getGeminiToolsAndClient(toolFilter)

  // Strip @report / @setting prefix from the message sent to Gemini
  const messagesForGemini = (isReport || isSetting)
    ? body.messages.map((m, i) =>
        i === body.messages.length - 1 && m.role === 'user'
          ? { ...m, content: m.content.replace(/^@(report|setting)\s*/i, '') }
          : m
      )
    : body.messages
  const contents = buildContentsFromHistory(messagesForGemini)

  const systemPrompt = isReport
    ? getReportSystemPrompt()
    : isSetting
      ? getSettingSystemPrompt()
      : undefined

  const { reply, toolCalls } = await runAgenticLoop({
    contents,
    geminiTools,
    mcpClient,
    companyId,
    userId,
    systemPrompt,
    cleanup,
    isTaxIncluded,
  })

  chatId = await persistMessages(chatId, companyId, userId, userMessage, reply, toolCalls)

  return { reply, toolCalls, chatId }
})
