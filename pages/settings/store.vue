<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '#ui/types';
import { useUpdateCompany,useFindUniqueCompany } from '~/lib/hooks';

const fileRef = ref<HTMLInputElement>();
const isDeleteAccountModalOpen = ref(false);
const UpdateCompany = useUpdateCompany();
const useAuth = () => useNuxtApp().$auth;

const isNameChanged = ref(false);
const isUpdatingName = ref(false);


const state = reactive({
    accHolderName:'',
    sortCode: '',
    accountNo: '',
    bankName: '',
});

const storeUniqueName = ref(useAuth().session.value?.storeUniqueName);

watch(() => storeUniqueName.value, (newName) => {
  isNameChanged.value = newName !== useAuth().session.value?.storeUniqueName;
}, { immediate: true });

const {
  data: taken,
} = useFindUniqueCompany({
  where: computed(() => ({
    storeUniqueName: storeUniqueName.value
  })),
  select: {
    id: true
  }
});

const toast = useToast();

function validate(state: any): FormError[] {
    const errors = [];
    if (!state.accHolderName)
        errors.push({ path: 'email', message: 'Please enter your email.' });
    if (!state.sortCode)
        errors.push({ path: 'email', message: 'Please enter your email.' });
    if (!state.accountNo)
        errors.push({ path: 'email', message: 'Please enter your email.' });
    if (!state.accountNo)
        errors.push({ path: 'email', message: 'Please enter your email.' });
    return errors;
}


const {
    data: info,
    isLoading,
    error,
    refetch,
} = useFindUniqueCompany({
  where:{
    id: useAuth().session.value?.companyId 
  },
  select:{
    id: true,
    accHolderName: true,
    sortCode: true,
    accountNo: true,
    bankName: true,
    
  }
});

watch(info, (newInfo) => {
  if (newInfo) {
    state.accHolderName = newInfo.accHolderName || '';
    state.sortCode = newInfo.sortCode || '';
    state.accountNo = newInfo.accountNo || '';
    state.bankName = newInfo.bankName || '';
  }
});

async function onNameUpdate() {
    isUpdatingName.value = true;
    isNameChanged.value = false;
    try {
        const res = await UpdateCompany.mutateAsync({
            where: {
                id: useAuth().session.value?.companyId,
            },
            data: {
                storeUniqueName: storeUniqueName.value,
            },
        });
        await updateStoreUniqueName(storeUniqueName.value)
        toast.add({ title: 'Store name updated', icon: 'i-heroicons-check-circle' });
       
    } catch (error) {
        console.error(error);
    } finally {
        isUpdatingName.value = false;
        
    }
}




async function onSubmit(event: FormSubmitEvent<any>) {

    try{
        const res  = UpdateCompany.mutateAsync({    
    where: {
        id:  useAuth().session.value?.companyId,
      },
      data: {
        accHolderName: state.accHolderName,
        sortCode: state.sortCode,
        accountNo: state.accountNo,
        bankName: state.bankName,
      },
    });
    console.log(res);
    }catch(error){
        console.log(error)
    }
  

    toast.add({ title: 'Profile updated', icon: 'i-heroicons-check-circle' });
}
</script>

<template>
    <UDashboardPanelContent class="pb-24">
            <UFormGroup
                    name="username"
                    label="Store Unique Name"
                    description="Unique name used for store URL."
                    required
                    class="grid grid-cols-2 gap-2 "
                    :ui="{ container: '',help: `mt-2 ${taken ? 'text-red-500 dark:text-red-400':'text-green-500 dark:text-green-400'}` }"
                    
                    
        
                >
                <template v-if="isNameChanged" #help>
                  {{taken ? 'This store name is already taken' : 'available'}}
                </template>
                    <UInput
                        v-model="storeUniqueName"
                        type="text"
                        autocomplete="off"
                        size="md"
                        input-class="ps-[128px]"
                    >
                        <template #leading>
                            <span
                                class="text-gray-500 dark:text-gray-400 text-sm"
                                >markit.com/store/</span
                            >
                        </template>
                    </UInput>
                       
                </UFormGroup>
                <div class="w-full flex justify-end mb-3">
                <UButton
                    label="Update Name"
                    size="md"
                    class="mt-4"
                    :loading="isUpdatingName"
                    :disabled="!isNameChanged "
                    @click="onNameUpdate"
                />
                </div>
        <UDivider class="mb-4" />

        <UForm
            :state="state"
            :validate="validate"
            :validate-on="['submit']"
            @submit="onSubmit"
        >
            <UDashboardSection
                title="Payment"
                description="This information is used for during your client payment"
            >
                <template #links>
                    <UButton type="submit" label="Save changes" color="black" />
                </template>

                <UFormGroup
                    name="accHolderName"
                    label="Account holder name"
                    description="Your bank account holder name."
                    required
                    class="grid grid-cols-2 gap-2"
                    :ui="{ container: '' }"
                >
                    <UInput
                        v-model="state.accHolderName"
                        type="text"
                        autocomplete="off"
                        size="md"
                        placeholder="Account Holder Name"
                    />
                </UFormGroup>

                <UFormGroup
                    name="sortCode"
                    label="Sort Code"
                    description="Your bank sort code."
                    required
                    class="grid grid-cols-2 gap-2"
                    :ui="{ container: '' }"
                >
                    <UInput
                        v-model="state.sortCode"
                        type="text"
                        autocomplete="off"
                        size="md"
                        placeholder="Sort Code"
                    />
                </UFormGroup>

                <UFormGroup
                    name="accountNo"
                    label="Account No"
                    description="Your bank account number."
                    required
                    class="grid grid-cols-2 gap-2"
                    :ui="{ container: '' }"
                >
                <UInput
                        v-model="state.accountNo"
                        type="text"
                        autocomplete="off"
                        size="md"
                        placeholder="Account No"
                    />
                </UFormGroup>

                <UFormGroup
                    name="bankName"
                    label="Bank Name"
                    description="Your bank name."
                    class="grid grid-cols-2 gap-2"
                    :ui="{ container: '' }"
                    required
                >
                    <UTextarea
                        v-model="state.bankName"
                        :rows="5"
                        autoresize
                        size="md"
                        placeholder="Bank Name"
                    />
                </UFormGroup>
            </UDashboardSection>
        </UForm>

      
    </UDashboardPanelContent>
</template>
