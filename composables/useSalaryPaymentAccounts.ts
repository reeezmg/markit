/** Form-owner native bank options; generation guards prevent stale company replies. */
export function useSalaryPaymentAccounts(companyScope: ReturnType<typeof useCompanyScope>) {
  const snapshots=useState<Record<string,{banks:{id:string;name:string}[];error:string}>>('salary-payment-account-options',()=>({}));
  const current=computed(()=>snapshots.value[companyScope.companyId.value] || {banks:[],error:''});
  const banks=computed({get:()=>current.value.banks,set:(value:{id:string;name:string}[])=>{
    snapshots.value[companyScope.companyId.value]={...current.value,banks:value};
  }});
  const loading=ref(false), error=computed({get:()=>current.value.error,set:(value:string)=>{
    snapshots.value[companyScope.companyId.value]={...current.value,error:value};
  }});
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
  watch(companyScope.companyId,()=>{load().catch(()=>{});});
  onServerPrefetch(()=>load().catch(()=>{}));
  onMounted(()=>{load().catch(()=>{});});
  return {banks,load,loading,error};
}
