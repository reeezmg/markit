import crypto from 'node:crypto'
import { pool } from '~/server/db'

export const AI_PROVIDER_TYPES = ['openai', 'openrouter', 'gemini', 'custom'] as const
export type AiProviderType = typeof AI_PROVIDER_TYPES[number]

export interface AiProviderInput {
  name: string
  provider: AiProviderType
  modelId: string
  baseUrl?: string
  apiKey?: string
  supportsImages?: boolean
  enabled?: boolean
}

const PROVIDER_URLS: Record<Exclude<AiProviderType, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
}

let tableReady: Promise<void> | null = null

export function ensureAiProvidersTable() {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS ai_provider_credentials (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model_id TEXT NOT NULL,
        encrypted_api_key TEXT NOT NULL,
        supports_images BOOLEAN NOT NULL DEFAULT FALSE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ai_provider_credentials_provider_check
          CHECK (provider IN ('openai', 'openrouter', 'gemini', 'custom')),
        UNIQUE (company_id, name)
      );
      CREATE INDEX IF NOT EXISTS ai_provider_credentials_company_idx
        ON ai_provider_credentials (company_id, updated_at DESC);
    `).then(() => undefined).catch((error) => {
      tableReady = null
      throw error
    })
  }
  return tableReady
}

function encryptionKey(runtime: ReturnType<typeof useRuntimeConfig>) {
  const configured = String(
    (runtime as any).aiProviderEncryptionKey
    || (runtime as any).auth?.password
    || '',
  )
  if (!configured) {
    throw createError({ statusCode: 500, statusMessage: 'AI provider encryption is not configured' })
  }
  return crypto.createHash('sha256').update(`markit:ai-provider:v1:${configured}`).digest()
}

function encryptApiKey(value: string, runtime: ReturnType<typeof useRuntimeConfig>) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(runtime), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

function decryptApiKey(value: string, runtime: ReturnType<typeof useRuntimeConfig>) {
  const [version, iv, tag, encrypted] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Unsupported encrypted API key')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(runtime), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
}

function cleanText(value: unknown, label: string, max: number) {
  const text = String(value || '').trim()
  if (!text || text.length > max) throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  return text
}

function safeBaseUrl(provider: AiProviderType, raw?: string) {
  const value = provider === 'custom' ? cleanText(raw, 'base URL', 500) : PROVIDER_URLS[provider]
  let url: URL
  try { url = new URL(value) } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid base URL' }) }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw createError({ statusCode: 400, statusMessage: 'Base URL must be a plain HTTPS URL' })
  }
  const hostname = url.hostname.toLowerCase()
  const blocked = hostname === 'localhost'
    || hostname === 'metadata.google.internal'
    || hostname.endsWith('.local')
    || /^127\./.test(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^169\.254\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || hostname === '::1'
  if (blocked) throw createError({ statusCode: 400, statusMessage: 'Private network base URLs are not allowed' })
  return url.toString().replace(/\/$/, '')
}

export function normalizeAiProviderInput(raw: Partial<AiProviderInput>, requireKey: boolean): AiProviderInput & { baseUrl: string } {
  const provider = String(raw.provider || '') as AiProviderType
  if (!AI_PROVIDER_TYPES.includes(provider)) throw createError({ statusCode: 400, statusMessage: 'Invalid provider' })
  const apiKey = String(raw.apiKey || '').trim()
  if (requireKey && (!apiKey || apiKey.length > 1000)) throw createError({ statusCode: 400, statusMessage: 'API key is required' })
  if (apiKey.length > 1000) throw createError({ statusCode: 400, statusMessage: 'Invalid API key' })
  return {
    name: cleanText(raw.name, 'name', 80),
    provider,
    modelId: cleanText(raw.modelId, 'model ID', 180),
    baseUrl: safeBaseUrl(provider, raw.baseUrl),
    apiKey,
    supportsImages: raw.supportsImages === true,
    enabled: raw.enabled !== false,
  }
}

function publicRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.baseUrl,
    modelId: row.modelId,
    supportsImages: row.supportsImages,
    enabled: row.enabled,
    hasApiKey: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listAiProviders(companyId: string, enabledOnly = false) {
  await ensureAiProvidersTable()
  const result = await pool.query(
    `SELECT id, name, provider, base_url AS "baseUrl", model_id AS "modelId",
            supports_images AS "supportsImages", enabled,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ai_provider_credentials
      WHERE company_id=$1 ${enabledOnly ? 'AND enabled=TRUE' : ''}
      ORDER BY updated_at DESC`,
    [companyId],
  )
  return result.rows.map(publicRow)
}

export async function createAiProvider(companyId: string, raw: Partial<AiProviderInput>, runtime: ReturnType<typeof useRuntimeConfig>) {
  await ensureAiProvidersTable()
  const input = normalizeAiProviderInput(raw, true)
  try {
    const result = await pool.query(
      `INSERT INTO ai_provider_credentials
         (company_id, name, provider, base_url, model_id, encrypted_api_key, supports_images, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, name, provider, base_url AS "baseUrl", model_id AS "modelId",
                 supports_images AS "supportsImages", enabled,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [companyId, input.name, input.provider, input.baseUrl, input.modelId,
        encryptApiKey(input.apiKey!, runtime), input.supportsImages, input.enabled],
    )
    return publicRow(result.rows[0])
  } catch (error: any) {
    if (error?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'An AI model with this name already exists' })
    throw error
  }
}

export async function updateAiProvider(companyId: string, id: string, raw: Partial<AiProviderInput>, runtime: ReturnType<typeof useRuntimeConfig>) {
  await ensureAiProvidersTable()
  const input = normalizeAiProviderInput(raw, false)
  const encryptedKey = input.apiKey ? encryptApiKey(input.apiKey, runtime) : null
  const result = await pool.query(
    `UPDATE ai_provider_credentials
        SET name=$3, provider=$4, base_url=$5, model_id=$6,
            encrypted_api_key=COALESCE($7, encrypted_api_key),
            supports_images=$8, enabled=$9, updated_at=NOW()
      WHERE company_id=$1 AND id=$2
      RETURNING id, name, provider, base_url AS "baseUrl", model_id AS "modelId",
                supports_images AS "supportsImages", enabled,
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    [companyId, id, input.name, input.provider, input.baseUrl, input.modelId,
      encryptedKey, input.supportsImages, input.enabled],
  )
  if (!result.rows[0]) throw createError({ statusCode: 404, statusMessage: 'AI model not found' })
  return publicRow(result.rows[0])
}

export async function deleteAiProvider(companyId: string, id: string) {
  await ensureAiProvidersTable()
  const result = await pool.query(`DELETE FROM ai_provider_credentials WHERE company_id=$1 AND id=$2`, [companyId, id])
  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: 'AI model not found' })
}

export async function resolveAiProvider(companyId: string, key: string, runtime: ReturnType<typeof useRuntimeConfig>) {
  const id = key.startsWith('byok:') ? key.slice(5) : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid AI model' })
  await ensureAiProvidersTable()
  const result = await pool.query(
    `SELECT id, name, provider, base_url AS "baseUrl", model_id AS "modelId",
            encrypted_api_key AS "encryptedApiKey", supports_images AS "supportsImages"
       FROM ai_provider_credentials WHERE company_id=$1 AND id=$2 AND enabled=TRUE`,
    [companyId, id],
  )
  const row = result.rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'AI model not found or disabled' })
  return { ...row, apiKey: decryptApiKey(row.encryptedApiKey, runtime), encryptedApiKey: undefined }
}
