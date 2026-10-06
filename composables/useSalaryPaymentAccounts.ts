/** Form-owner native bank options; generation guards prevent stale company replies. */
export function useSalaryPaymentAccounts(companyScope: ReturnType<typeof useCompanyScope>) {
  const banks=ref<{id:string;name:string}[]>([]);
  const loading=ref(false), error=ref('');
  let generation=0;
  async function load(paymentId?:string) {
    const version=++generation, owner=companyScope.companyId.value;
    loading.value=true;error.value='';banks.value=[];
    try {
      const data=await companyScope.fetch<{banks:{id:string;name:string}[];selectedBankId:string|null}>('/api/salary/payment-options', {
        headers:{'x-company-id':owner,'x-company-filter':owner},query:paymentId?{paymentId}:undefined,
      });
      if(version!==generation || owner!==companyScope.companyId.value)return null;
      banks.value=data.banks;
      return data.selectedBankId;
    } catch(e:any) {if(version===generation)error.value=e.data?.statusMessage || e.message;throw e;}
    finally {if(version===generation)loading.value=false;}
  }
  watch(companyScope.companyId,()=>{load().catch(()=>{});},{immediate:true});
  return {banks,load,loading,error};
}
