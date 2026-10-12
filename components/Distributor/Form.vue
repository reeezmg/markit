
<script setup lang="ts">
const companyScope = useCompanyScope('form');
const $fetch = companyScope.fetch;
const { invalidateModels } = useModelCache();

import { useCreateDistributor, useUpdateDistributor, useDeleteDistributor } from '~/lib/company-hooks/distributor';
import { useUpdateDistributorCompany } from '~/lib/company-hooks/distributor-company';

const props = defineProps({
    selectedSupplier: {
        type: Object,
        required: false
    },
    openingDue: {
        type: Number,
        default: 0
    },
    openingDueDate: {
        type: String,
        default: ''
    },
    distributorCompanyKey: {
        type: Object as () => { distributorId: string; companyId: string } | null,
        default: null
    },
});

const companyLink = computed(() => props.distributorCompanyKey || (props.selectedSupplier?.companyId ? { distributorId: props.selectedSupplier.id, companyId: props.selectedSupplier.companyId } : null));
watch(companyLink, value => { void companyScope.beginForm(value ? { model: 'DistributorCompany', id: value.distributorId, companyId: value.companyId } : null); }, { immediate: true });

const emit = defineEmits(['transferred', 'saved']);
const iscreating = ref(false);
const toast = useToast();
const useAuth = () => companyScope.auth;
const CreateDistributor = useCreateDistributor()
const UpdateDistributor = useUpdateDistributor()
const UpdateDistributorCompany = useUpdateDistributorCompany()

const supplierData = computed(() => ({
    date: props.selectedSupplier?.createdAt
        ? new Date(props.selectedSupplier?.createdAt).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],

    id: props.selectedSupplier?.id || '',
    name: props.selectedSupplier?.name || '',
    accHolderName: props.selectedSupplier?.accHolderName || '',
    ifsc: props.selectedSupplier?.ifsc || '',
    accountNo: props.selectedSupplier?.accountNo || '',
    bankName: props.selectedSupplier?.bankName || '',
    upiId: props.selectedSupplier?.upiId || '',
    gstin: props.selectedSupplier?.gstin || '',
    street: props.selectedSupplier?.address?.street || '',
    locality: props.selectedSupplier?.address?.locality || '',
    city: props.selectedSupplier?.address?.city || '',
    state: props.selectedSupplier?.address?.state || '',
    pincode: props.selectedSupplier?.address?.pincode || '',
    openingDue: props.openingDue ?? 0,
    openingDueDate: props.openingDueDate
        ? new Date(props.openingDueDate).toISOString().split('T')[0]
        : '',
}));

const supplier = ref({...supplierData.value});




const submitForm = async () => {
  try {
     iscreating.value = true;
    if(supplier.value.id){
         const res = await UpdateDistributor.mutateAsync({
          where:{
            id:supplier.value.id
          },
      data: {
                name: supplier.value.name,
                accHolderName: supplier.value.accHolderName,
                ifsc: supplier.value.ifsc,
                accountNo: supplier.value.accountNo,
                bankName: supplier.value.bankName,
                gstin: supplier.value.gstin,
                upiId: supplier.value.upiId,
                address: {
                    create: {
                        street: supplier.value.street,
                        locality: supplier.value.locality,
                        city: supplier.value.city,
                        state: supplier.value.state,
                        pincode: supplier.value.pincode,
                    },
                },
                
              }
    })
    // Update opening due on distributor-company link
    if (companyLink.value) {
      await UpdateDistributorCompany.mutateAsync({
        where: {
          distributorId_companyId: companyLink.value,
        },
        data: {
          openingDue: supplier.value.openingDue || 0,
          openingDueDate: supplier.value.openingDueDate ? new Date(supplier.value.openingDueDate) : null,
        },
      })
    }
    toast.add({
            title: 'Distributor Updated !',
            id: 'modal-success',
        });

    }
   else{
    // Atomically get next distributor number
    const { number: distributorNumber } = await $fetch('/api/counter/increment', {
        method: 'POST',
        body: { entity: 'distributor' },
    });

    const res = await CreateDistributor.mutateAsync({
      data: {
                name: supplier.value.name,
                accHolderName: supplier.value.accHolderName,
                ifsc: supplier.value.ifsc,
                accountNo: supplier.value.accountNo,
                bankName: supplier.value.bankName,
                gstin: supplier.value.gstin,
                upiId: supplier.value.upiId,
                address: {
                    create: {
                        street: supplier.value.street,
                        locality: supplier.value.locality,
                        city: supplier.value.city,
                        state: supplier.value.state,
                        pincode: supplier.value.pincode,
                    },
                },
                companies:{
                  create:{
                    distributorNumber,
                    company:{
                      connect:{
                        id:useAuth().session.value?.companyId
                      }
                    },
                    openingDue: supplier.value.openingDue || 0,
                    openingDueDate: supplier.value.openingDueDate ? new Date(supplier.value.openingDueDate) : null,
                  }
                }
              }
    })
    toast.add({
            title: 'Distributor added !',
            id: 'modal-success',
        });
       
  }
   
    
    await invalidateModels('Distributor', 'DistributorCompany');
    emit('saved');
  }catch(error:any){
    toast.add({ title: 'Could not save distributor', description: error?.data?.statusMessage || error?.message, color: 'red' });
  }finally{
     iscreating.value = false
    
  }
};

</script>


<template>
        <div class="p-4 space-y-4">
      <CompanyFormField @transferred="emit('transferred')" />
          <h2 class="text-lg font-semibold">Enter Distributor Details</h2>

          <!-- Name -->
          <h3 class="text-md font-semibold">Personal Details</h3>
          <UFormGroup label="Supplier Name">
            <UInput v-model="supplier.name" placeholder="Enter full name" required />
          </UFormGroup>

          <!-- Address -->
          <h3 class="text-md font-semibold mt-4">Address Details</h3>
          <UFormGroup label="Street">
            <UInput v-model="supplier.street" placeholder="Enter street name" required />
          </UFormGroup>
          <UFormGroup label="Locality">
            <UInput v-model="supplier.locality" placeholder="Enter locality" required />
          </UFormGroup>
          <UFormGroup label="City">
            <UInput v-model="supplier.city" placeholder="Enter city name" required />
          </UFormGroup>
          <UFormGroup label="State">
            <UInput v-model="supplier.state" placeholder="Enter state name" required />
          </UFormGroup>
          <UFormGroup label="Pincode">
            <UInput v-model="supplier.pincode" placeholder="Enter pincode" required />
          </UFormGroup>

          <!-- GSTIN -->
          <h3 class="text-md font-semibold mt-4">Tax Information</h3>
          <UFormGroup label="GSTIN">
            <UInput v-model="supplier.gstin" placeholder="Enter 15-digit GST Number" required />
          </UFormGroup>

          <!-- Opening Due -->
          <h3 class="text-md font-semibold mt-4">Opening Due</h3>
          <UFormGroup label="Opening Due Date">
            <UInput v-model="supplier.openingDueDate" type="date" />
          </UFormGroup>
          <UFormGroup label="Opening Due Amount">
            <UInput v-model.number="supplier.openingDue" placeholder="Positive = you owe, Negative = they owe" type="number" step="0.01" />
          </UFormGroup>

          <!-- Bank Account Details -->
          <h3 class="text-md font-semibold mt-4">Bank Account Details</h3>
          <UFormGroup label="Account Holder Name">
            <UInput v-model="supplier.accHolderName" placeholder="Enter account holder name" required />
          </UFormGroup>
          <UFormGroup label="Bank Name">
            <UInput v-model="supplier.bankName" placeholder="Enter bank name" required />
          </UFormGroup>
          <UFormGroup label="Account Number">
            <UInput v-model="supplier.accountNo" placeholder="Enter account number" required />
          </UFormGroup>
          <UFormGroup label="IFSC Code">
            <UInput v-model="supplier.ifsc" placeholder="Enter IFSC Code" required />
          </UFormGroup>
          <UFormGroup label="UPI ID">
            <UInput v-model="supplier.upiId" placeholder="Enter UPI ID" required />
          </UFormGroup>

          <!-- Submit Button -->
          <UButton @click="submitForm" :loading="iscreating" block>Submit</UButton>
        </div>
</template>
