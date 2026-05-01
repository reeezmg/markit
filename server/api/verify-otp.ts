// server/api/verify-otp.post.ts
import { prisma } from '~/server/prisma'; // adjust if different
import { Prisma } from '@prisma/client'

const RETRYABLE_PRISMA_CODES = new Set(['P1001', 'P1002'])
const DB_RETRY_ATTEMPTS = 3
const DB_RETRY_DELAY_MS = 400

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function isRetryablePrismaError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    RETRYABLE_PRISMA_CODES.has(error.code)
}

async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isRetryablePrismaError(error) || attempt === DB_RETRY_ATTEMPTS) {
        throw error
      }
      await wait(DB_RETRY_DELAY_MS * attempt)
    }
  }

  throw lastError
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, otp } = body

  if (!email || !otp) {
    throw createError({ statusCode: 400, message: 'Email and OTP are required' })
  }

  try {
    const record = await withDbRetry(() => prisma.emailOtp.findUnique({
      where: { email },
    }))

    if (!record) {
      throw createError({ statusCode: 404, message: 'OTP not found' })
    }

    const now = new Date()
    if (record.expiresAt < now) {
      await withDbRetry(() => prisma.emailOtp.delete({ where: { email } })) // cleanup expired OTP
      throw createError({ statusCode: 410, message: 'OTP has expired' })
    }

    if (record.otp !== otp) {
      throw createError({ statusCode: 401, message: 'Invalid OTP' })
    }

    // OTP is valid — delete token after successful verification.
    await withDbRetry(() => prisma.emailOtp.delete({ where: { email } }))

    return { message: 'OTP verified successfully' }
  } catch (error: unknown) {
    if (isRetryablePrismaError(error)) {
      throw createError({
        statusCode: 503,
        message: 'Database is waking up. Please retry in a few seconds.',
      })
    }
    throw error
  }
})
