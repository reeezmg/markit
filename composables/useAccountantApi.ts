import { useQueryClient } from '@tanstack/vue-query';

export function useAccountantApi() {
  const scope = useCompanyScope();
  const toast = useToast();
  const queryClient = useQueryClient();
  async function request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: any, options?: any): Promise<T> {
    try {
      const companyId = scope.companyId.value;
      const result = await scope.fetch<T>(`/api/accountant${path}`, { ...options, method, ...(body === undefined ? {} : { body }) });
      if (method !== 'GET') await queryClient.invalidateQueries({ queryKey: ['accountant-v2', companyId] });
      return result;
    } catch (error: any) {
      const message = error?.data?.statusMessage || error.message || 'The request could not be completed';
      // Every action, including management actions with no local catch, has visible feedback.
      toast.add({ title: 'Accountant request failed', description: message, color: 'red' });
      throw new Error(message);
    }
  }
  return {
    companyId: scope.companyId,
    get: <T = any>(path: string, options?: any) => request<T>('GET', path, undefined, options),
    post: <T = any>(path: string, body?: any) => request<T>('POST', path, body),
    put: <T = any>(path: string, body?: any) => request<T>('PUT', path, body),
    patch: <T = any>(path: string, body?: any) => request<T>('PATCH', path, body),
    delete: <T = any>(path: string) => request<T>('DELETE', path),
  };
}
