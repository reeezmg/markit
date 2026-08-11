type VercelConfig = {
  token: string
  teamId: string
  apiBaseUrl?: string
  /** Origin of this editor — the storefront only accepts preview/picker
   *  messages from it, so without it the live preview stays inert. */
  editorOrigin?: string
}

type VercelDeployment = {
  id: string
  /** `/v6/deployments` calls this field `uid`; create/get endpoints use `id`. */
  uid?: string
  url?: string
  readyState?: string
  status?: string
}

type VercelAlias = {
  alias?: string
  url?: string
  gitBranch?: string | null
}

function query(config: VercelConfig) {
  return config.teamId ? `?teamId=${encodeURIComponent(config.teamId)}` : ''
}

async function vercelRequest<T>(config: VercelConfig, path: string, init: RequestInit = {}) {
  if (!config.token) throw new Error('Vercel storefront service is not configured')
  const response = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : query(config) ? '?' : ''}${query(config).replace(/^\?/, '')}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Vercel request failed (${response.status}): ${detail.slice(0, 500)}`)
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}

export function vercelProjectName(storeUniqueName: string) {
  const normalized = storeUniqueName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '')
  if (!normalized) throw new Error('The store unique name cannot be used as a Vercel project name')
  return normalized.slice(0, 100)
}

export async function ensureVercelStorefrontProject(
  config: VercelConfig,
  projectName: string,
  repositoryFullName: string,
) {
  try {
    const existing = await vercelRequest<{ id: string; name: string }>(
      config,
      `/v9/projects/${encodeURIComponent(projectName)}`,
    )
    return existing
  } catch (error: any) {
    if (!String(error?.message).includes('(404)')) throw error
  }

  return vercelRequest<{ id: string; name: string }>(config, '/v11/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      framework: 'vite',
      gitRepository: { type: 'github', repo: repositoryFullName },
      installCommand: 'npm ci',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      rootDirectory: null,
    }),
  })
}

export function makeVercelStorefrontEmbeddable(config: VercelConfig, projectId: string) {
  return vercelRequest<{ id: string; name: string }>(
    config,
    `/v9/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ ssoProtection: null }),
    },
  )
}

async function upsertVercelEnvironmentVariable(
  config: VercelConfig,
  projectId: string,
  key: string,
  value: string,
  target: ('production' | 'preview')[] = ['production', 'preview'],
) {
  return vercelRequest(config, `/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`, {
    method: 'POST',
    body: JSON.stringify({
      key,
      value,
      type: 'plain',
      target,
    }),
  })
}

export async function configureVercelStorefrontEnvironment(
  config: VercelConfig,
  projectId: string,
  companyId: string,
) {
  const apiBaseUrl = config.apiBaseUrl || 'https://markit-custom-api.vercel.app/api'
  const editorOrigin = config.editorOrigin
    || 'http://localhost:3000,https://local.markit.co.in,https://markit.co.in'
  await Promise.all([
    upsertVercelEnvironmentVariable(config, projectId, 'VITE_API_BASE_URL', apiBaseUrl),
    upsertVercelEnvironmentVariable(config, projectId, 'VITE_COMPANY_ID', companyId),
    upsertVercelEnvironmentVariable(config, projectId, 'VITE_EDITOR_ORIGIN', editorOrigin),
  ])
}

export function createVercelGitDeployment(
  config: VercelConfig,
  projectId: string,
  projectName: string,
  repositoryId: number,
  branch: 'main' | 'preview',
) {
  return vercelRequest<VercelDeployment>(config, '/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      project: projectId,
      target: branch === 'main' ? 'production' : undefined,
      gitSource: { type: 'github', repoId: repositoryId, ref: branch },
    }),
  })
}

export function getVercelDeployment(config: VercelConfig, deploymentId: string) {
  return vercelRequest<VercelDeployment>(config, `/v13/deployments/${encodeURIComponent(deploymentId)}`)
}

export async function getVercelDeploymentAliases(config: VercelConfig, deploymentId: string) {
  const result = await vercelRequest<{ aliases?: VercelAlias[] } | VercelAlias[]>(
    config,
    `/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`,
  )
  const rows = Array.isArray(result) ? result : result.aliases || []
  return rows
    .map(row => row.alias || row.url || '')
    .filter(Boolean)
    .map(value => value.replace(/^https?:\/\//, '').replace(/\/$/, ''))
}

/**
 * The two hostnames a storefront gets.
 *
 *   acme.markit.co.in          -> production (main)
 *   preview-acme.markit.co.in  -> preview branch
 *
 * Reuses vercelProjectName's normalisation so the hostname and the Vercel
 * project name can never drift apart.
 *
 * NOTE: the `preview-` prefix must be reserved at signup. A seller who picks
 * the name "preview-acme" would otherwise own the hostname that serves another
 * seller's preview site.
 */
export function storefrontHostnames(storeUniqueName: string, rootDomain: string) {
  const slug = vercelProjectName(storeUniqueName)
  return {
    production: `${slug}.${rootDomain}`,
    preview: `preview-${slug}.${rootDomain}`,
  }
}

/**
 * Attach a domain to a project. Pass gitBranch to bind it to a branch rather
 * than to production.
 *
 * Idempotent: a domain already attached to this project comes back 409, which
 * is success as far as we're concerned. A 409 because it belongs to a DIFFERENT
 * project is a real conflict and is re-thrown - that is the seller-name
 * collision case, and it must be loud.
 */
export async function addVercelDomain(
  config: VercelConfig,
  projectIdOrName: string,
  name: string,
  gitBranch?: string,
) {
  try {
    return await vercelRequest<{ name: string; verified: boolean }>(
      config,
      `/v10/projects/${encodeURIComponent(projectIdOrName)}/domains`,
      { method: 'POST', body: JSON.stringify({ name, ...(gitBranch ? { gitBranch } : {}) }) },
    )
  } catch (error: any) {
    const message = String(error?.message ?? '')
    if (message.includes('(409)') && message.includes('domain_already_in_use')) {
      // Taken by another project - a genuine collision, do not swallow it.
      throw error
    }
    if (message.includes('(409)')) return { name, verified: true }
    throw error
  }
}

/**
 * Most recent deployment for a branch.
 *
 * Used instead of remembering an id we created ourselves: the push triggers the
 * build now, so storetools never sees a deployment id up front. Asking "what is
 * the latest deployment on preview" also reflects deployments triggered from
 * anywhere else, which the stored-id approach silently missed.
 */
export async function latestVercelDeployment(
  config: VercelConfig,
  projectId: string,
  gitBranch: string,
) {
  const result = await vercelRequest<{ deployments?: VercelDeployment[] }>(
    config,
    `/v6/deployments?projectId=${encodeURIComponent(projectId)}` +
    `&meta-githubCommitRef=${encodeURIComponent(gitBranch)}&limit=1`,
  )
  const latest = result?.deployments?.[0]
  if (!latest) return null
  const id = latest.id || latest.uid
  return id ? { ...latest, id } : null
}

export function deploymentState(deployment: VercelDeployment) {
  return deployment.readyState || deployment.status || 'BUILDING'
}

export function deploymentUrl(deployment: VercelDeployment) {
  return deployment.url ? `https://${deployment.url}` : null
}

function asUrl(hostname?: string | null) {
  return hostname ? `https://${hostname.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : null
}

export function stablePreviewUrl(aliases: string[]) {
  const branchAlias = aliases.find(alias => alias.includes('-git-preview-'))
    || aliases.find(alias => alias.includes('-git-'))
    || aliases[0]
  return asUrl(branchAlias)
}

export function stableProductionUrl(aliases: string[]) {
  const customDomain = aliases.find(alias => !alias.endsWith('.vercel.app'))
  const projectAlias = aliases.find(alias => !alias.includes('-git-'))
  return asUrl(customDomain || projectAlias || aliases[0])
}
