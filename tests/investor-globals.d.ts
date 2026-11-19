declare global {
    const nextTick: typeof import('vue')['nextTick'];
    function useSelectedAccounts(): { get(companyId: string): Promise<{ defaults: Record<string, any> }> };
    function useToast(): { add(message: any): void };
}
export {};
