/** Keep the existing row actions bound to the store that owns the selected record. */
export function useOrganizationActions() {
  const scope = useCompanyScope();
  const toast = useToast();
  const route = useRoute();

  async function selectOwner(companyId?: string | null) {
    try {
      await scope.selectOwner(companyId);
      return true;
    } catch (error: any) {
      toast.add({ title: 'Could not select store', description: error?.data?.statusMessage ?? 'Please try again', color: 'red' });
      return false;
    }
  }

  async function selectOwnerAndReload(companyId?: string | null) {
    const path = route.path;
    const model = path.startsWith('/erp/') ? 'Bill'
      : path.includes('edit-purchase-return') ? 'PurchaseReturn'
      : path.includes('/brands/') ? 'Brand'
      : path.includes('/categories/') ? 'Category'
      : path.includes('/collections/') ? 'Collection'
      : route.query.poId ? 'PurchaseOrder' : 'Product';
    const id = String(route.params.id || route.params.salesId || route.query.poId || '');
    if (companyId && id) scope.record.value = { model, id, companyId };
    return selectOwner(companyId);
  }

  function forOwner(groups: any[][], companyId?: string | null): any[][] {
    return groups.map((group) => group.map((item) => item.click ? {
      ...item,
      click: async (...args: any[]) => {
        if (await selectOwner(companyId)) return item.click?.(...args);
      },
    } : item));
  }

  return { selectOwner, selectOwnerAndReload, forOwner };
}
