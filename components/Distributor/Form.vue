
<script setup lang="ts">
import { useCreateDistributor,useUpdateDistributor, useDeleteDistributor } from '~/lib/hooks';

const props = defineProps({
    selectedSupplier: {
        type: Object,
        required: false
    }
});

const iscreating = ref(false);
const toast = useToast();
const useAuth = () => useNuxtApp().$auth;
const CreateDistributor = useCreateDistributor()
const UpdateDistributor = useUpdateDistributor()



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
    street: props.selectedSupplier?.address.street || '',
    locality: props.selectedSupplier?.address.locality || '',
    city: props.selectedSupplier?.address.city || '',
    state: props.selectedSupplier?.address.state || '',
    pincode: props.selectedSupplier?.address.pincode || '',
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
    toast.add({
            title: 'Distributor Updated !',
            id: 'modal-success',
        });
       
    }
   else{
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
                    company:{
                      connect:{
                        id:useAuth().session.value?.companyId
                      }
                    }
                  }
                }
              }
    })
    toast.add({
            title: 'Distributor added !',
            id: 'modal-success',
        });
       
  }
   
    
  }catch(error){
    console.log(error)
  }finally{
     iscreating.value = false
    
  }
};

</script>


<template>
        <div class="p-4 space-y-4">
          <h2 class="text-lg font-semibold">Enter Distributor Details</h2>

          <!-- Name -->
          <h3 class="text-md font-semibold">Personal Details</h3>
          <UInput v-model="supplier.name" label="Supplier Name" placeholder="Enter full name" required />

          <!-- Address -->
          <h3 class="text-md font-semibold mt-4">Address Details</h3>
          <UInput v-model="supplier.street" label="Street" placeholder="Enter street name" required />
          <UInput v-model="supplier.locality" label="Locality" placeholder="Enter locality" required />
          <UInput v-model="supplier.city" label="City" placeholder="Enter city name" required />
          <UInput v-model="supplier.state" label="State" placeholder="Enter state name" required />
          <UInput v-model="supplier.pincode" label="Pincode" placeholder="Enter pincode" required />

          <!-- GSTIN -->
          <h3 class="text-md font-semibold mt-4">Tax Information</h3>
          <UInput v-model="supplier.gstin" label="GSTIN" placeholder="Enter 15-digit GST Number" required />

          <!-- Bank Account Details -->
          <h3 class="text-md font-semibold mt-4">Bank Account Details</h3>
          <UInput v-model="supplier.accHolderName" label="Account Holder Name" placeholder="Enter bank name" required />
          <UInput v-model="supplier.bankName" label="Bank Name" placeholder="Enter bank name" required />
          <UInput v-model="supplier.accountNo" label="Account Number" placeholder="Enter account number" required />
          <UInput v-model="supplier.ifsc" label="IFSC Code" placeholder="Enter IFSC Code" required />
          <UInput v-model="supplier.upiId" label="IFSC Code" placeholder="Enter UPI ID" required />

          <!-- Submit Button -->
          <UButton @click="submitForm" :loading="iscreating" block>Submit</UButton>
        </div>
</template>