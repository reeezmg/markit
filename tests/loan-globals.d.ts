declare global {
    const ref: typeof import('vue')['ref'];
    const computed: typeof import('vue')['computed'];
    const reactive: typeof import('vue')['reactive'];
    const watch: typeof import('vue')['watch'];
    const onMounted: typeof import('vue')['onMounted'];
    function useAccountantApi(): {
        companyId: import('vue').Ref<string>;
        get<T = any>(path: string, options?: any): Promise<T>;
        post<T = any>(path: string, body?: any): Promise<T>;
        put<T = any>(path: string, body?: any): Promise<T>;
        delete<T = any>(path: string): Promise<T>;
    };
    function useAuth(): { session: import('vue').Ref<{ role?: string } | null> };
    function useRoute(): { query: Record<string, any>; params: Record<string, any> };
    function navigateTo(to: any, options?: { replace?: boolean }): Promise<any>;
    const createError: typeof import('h3')['createError'];
}
export {};
