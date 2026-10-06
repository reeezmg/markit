import { storefrontTransport } from './storefrontTransport'

export function awsStorefrontRequest<T>(operation: string, companyId: string, body?: Record<string, unknown>) {
  const path = `/agent/storefront/${operation}`
  return storefrontTransport<T>(body ? path : `${path}?companyId=${encodeURIComponent(companyId)}`,
    body ? { method: 'POST', body: JSON.stringify({ ...body, companyId }) } : {}, companyId, true)
}

export type AwsStorefrontStatus = {
  status: 'CREATING' | 'READY' | 'FAILED'; ready: boolean; previewUrl: string | null
  previewStatus: string | null; productionStatus: string | null; previewDeploymentId: string | null
}
