<script setup lang="ts">
import { useCreateDistributor,useFindManyDistributor } from '~/lib/hooks';
import type { Prisma } from '~/prisma/generated/client';

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

const paymentTypes = ['Credit', 'Cash/Prepaid']
const paymentType = ref('')

const emit = defineEmits(['update']);

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

const {
    data: distributors,
    isLoading,
    error,
    refetch,
} = useFindManyDistributor({
      where: {
            companies: {
                some: {
                    companyId: useAuth().session.value?.companyId,
                },
            },
        },
});
const selected = ref<Prisma.DistributorFieldRefs>({} as Prisma.DistributorFieldRefs);

const emitUpdatedValues = () => {
  emit('update', {
    distributorId: selected.value?.id || null,
    paymentType: paymentType.value
  });
};

// Watch for changes and emit updates
watch([selected, paymentType], emitUpdatedValues, { deep: true });

</script>

<template>
  <div class="flex">
    <div class="flex">
  <USelectMenu class=" min-w-44 me-2" v-model="selected" :options="distributors" searchable searchable-placeholder="Search a distributor">
    <template #label>
      <span v-if="!selected.name">Select Distributor</span>
      <span>{{ selected.name }}</span>
    </template>
    <template #option="{option:name}">
      <span>{{ name.name }}</span>
    </template>
  </USelectMenu>
  <UButton
    icon="i-heroicons-plus"
    size="sm"
    color="primary"
    square
    variant="solid"
    @click="isOpen = true"
  />
</div>

<UDivider class="mx-3" orientation="vertical"/>
<USelect v-model="paymentType" :options="paymentTypes"  placeholder="Payment Type"/>
</div>

  <template>
    <div>
      <UModal v-model="isOpen">
        <div class="p-4 space-y-4">
          <h2 class="text-lg font-semibold">Enter Supplier Details</h2>

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
    </div>
  </template>

</template>
