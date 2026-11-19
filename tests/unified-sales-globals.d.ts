declare global {
  const useRouter: typeof import('vue-router')['useRouter']
  function useBillStore(): {lastUpdate:any}
  function useSalesTableStore(): any
  function useOrganizationActions(): {forOwner(items:any,companyId:string):any}
  function usePrint(): {printBill(data:any):Promise<any>}
}
export {}
