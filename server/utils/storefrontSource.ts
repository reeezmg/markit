import { createSign } from 'node:crypto'
import { pool } from '~/server/db'

export type StorefrontSourceStatus = 'CREATING' | 'READY' | 'FAILED'

type GitHubConfig = {
  appId: string
  privateKey: string
  installationId: string
  owner: string
  templateRepository: string
}

let tableReady: Promise<void> | null = null

export function ensureStorefrontSourcesTable() {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS storefront_sources (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        company_id TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        repository_id BIGINT,
        repository_full_name TEXT,
        preview_branch TEXT NOT NULL DEFAULT 'preview',
        status TEXT NOT NULL CHECK (status IN ('CREATING', 'READY', 'FAILED')),
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS vercel_project_id TEXT;
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS preview_deployment_id TEXT;
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS preview_deployment_url TEXT;
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS preview_branch_url TEXT;
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS preview_deployment_status TEXT;
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS production_deployment_id TEXT;
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS production_deployment_url TEXT;
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS production_url TEXT;
      ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS production_deployment_status TEXT;
    `).then(() => undefined)
  }
  return tableReady
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function createAppJwt(config: GitHubConfig) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: config.appId }))
  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const privateKey = config.privateKey.includes('\\n')
    ? config.privateKey.replace(/\\n/g, '\n')
    : config.privateKey
  return `${unsigned}.${signer.sign(privateKey, 'base64url')}`
}

async function githubRequest<T>(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub request failed (${response.status}): ${detail.slice(0, 500)}`)
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}

export async function publishStorefrontPreview(config: GitHubConfig, repositoryFullName: string) {
  if (!config.appId || !config.privateKey || !config.installationId) {
    throw new Error('Storefront repository service is not configured')
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryFullName)) {
    throw new Error('Invalid storefront repository')
  }

  const token = await getGitHubInstallationToken(config)
  const [preview, main] = await Promise.all([
    githubRequest<{ object: { sha: string } }>(`/repos/${repositoryFullName}/git/ref/heads/preview`, token),
    githubRequest<{ object: { sha: string } }>(`/repos/${repositoryFullName}/git/ref/heads/main`, token),
  ])
  const previewSha = preview.object.sha
  const mainSha = main.object.sha
  if (previewSha === mainSha) return { published: false, sha: mainSha }

  const comparison = await githubRequest<{ status: string }>(
    `/repos/${repositoryFullName}/compare/${mainSha}...${previewSha}`,
    token,
  )
  if (!['ahead', 'identical'].includes(comparison.status)) {
    const error = new Error('Preview and live storefront histories have diverged. Publish was stopped to protect the live branch.')
    Object.assign(error, { statusCode: 409 })
    throw error
  }

  await githubRequest(
    `/repos/${repositoryFullName}/git/refs/heads/main`,
    token,
    { method: 'PATCH', body: JSON.stringify({ sha: previewSha, force: false }) },
  )
  return { published: true, sha: previewSha }
}

export async function getGitHubInstallationToken(config: GitHubConfig) {
  const result = await githubRequest<{ token: string }>(
    `/app/installations/${encodeURIComponent(config.installationId)}/access_tokens`,
    createAppJwt(config),
    { method: 'POST' },
  )
  return result.token
}

export async function createPrivateStorefrontRepository(config: GitHubConfig, repositoryName: string) {
  if (!config.appId || !config.privateKey || !config.installationId) {
    throw new Error('Storefront repository service is not configured')
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repositoryName)) {
    throw new Error('The store unique name cannot be used as a repository name')
  }

  const token = await getGitHubInstallationToken(config)
  const existingResponse = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(repositoryName)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )
  if (existingResponse.ok) {
    const existing = await existingResponse.json() as { id: number; full_name: string; private: boolean }
    if (!existing.private) throw new Error('Existing storefront repository is not private')
    return { id: existing.id, fullName: existing.full_name }
  }
  if (existingResponse.status !== 404) {
    throw new Error(`Unable to inspect existing storefront repository (${existingResponse.status})`)
  }

  const repository = await githubRequest<{ id: number; full_name: string }>(
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.templateRepository)}/generate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        owner: config.owner,
        name: repositoryName,
        private: true,
        include_all_branches: true,
      }),
    },
  )

  return { id: repository.id, fullName: repository.full_name }
}

export function publicStorefrontSourceStatus(
  status?: StorefrontSourceStatus | null,
  previewUrl?: string | null,
  previewStatus?: string | null,
  productionStatus?: string | null,
  /** Lets the editor tell "a NEW build finished" from "the old one is still
   *  READY" - without it, waiting for READY returns instantly and the iframe
   *  reloads the previous build. */
  previewDeploymentId?: string | null,
) {
  return {
    status: status || 'NOT_CREATED',
    ready: status === 'READY',
    previewUrl: status === 'READY' ? previewUrl || null : null,
    previewStatus: previewStatus || null,
    productionStatus: productionStatus || null,
    previewDeploymentId: previewDeploymentId || null,
  }
}
