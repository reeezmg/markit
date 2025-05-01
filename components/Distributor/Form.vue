
<script setup lang="ts">
import { useCreateDistributor } from '~/lib/hooks';


const model = defineModel({
    type: Boolean,
});


const isOpen = ref(false);
const toast = useToast();
const useAuth = () => useNuxtApp().$auth;
const CreateDistributor = useCreateDistributor()
const supplier = ref({
    name: '',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    bankName: '',
    accountNo: '',
    ifsc: '',
    accHolderName:''
});


const submitForm = async () => {
  try {
    const res = await CreateDistributor.mutateAsync({
      data: {
                name: supplier.value.name,
                accHolderName: supplier.value.accHolderName,
                ifsc: supplier.value.ifsc,
                accountNo: supplier.value.accountNo,
                bankName: supplier.value.bankName,
                gstin: supplier.value.gstin,
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
    isOpen.value = false
  }catch(error){
    console.log(error)
  }
};

</script>


<template>
     <UModal v-model="model">
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

          <!-- Submit Button -->
          <UButton @click="submitForm" block>Submit</UButton>
        </div>
      </UModal>
</template>