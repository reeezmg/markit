import { useFindManyCategory } from '@/lib/hooks';

const useAuth = () => useNuxtApp().$auth;
  

export async function initTaxData() {
  const taxdataState = useState('taxdata', () => null);
    const { data } = await useFindManyCategory({
      where: {
        companyId: useAuth().session.value?.companyId ,
      },
      select: {
        fixedTax: true,
        taxBelowThreshold: true,
        taxAboveThreshold: true,
        thresholdAmount: true,
        taxType: true,
      },
    });

    taxdataState.value = data.value;
  
}
