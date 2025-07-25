<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '#ui/types';
import { useUpdateCompany, useFindUniqueCompany, useUpsertAddress } from '~/lib/hooks';

const UpdateCompany = useUpdateCompany();
const UpsertAddress = useUpsertAddress();
const useAuth = () => useNuxtApp().$auth;

const isNameChanged = ref(false);

const isUpdatingName = ref(false);
const isUpdatingAddress = ref(false);
const isUpdatingAccount = ref(false);
const isUpdatingInputs = ref(false);
const isUpdatingPointsValue = ref(false);


interface AccountState {
  accHolderName?: string;
  ifsc?: string;
  accountNo?: string;
  bankName?: string;
  upiId?: string;
  gstin?: string;
}

interface AddressState {
  street: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
}

const accstate = reactive<AccountState>({
  accHolderName: '',
  ifsc: '',
  accountNo: '',
  bankName: '',
  upiId:'',
  gstin: '',
});

const addstate = reactive<AddressState>({
  street: '',
  locality: '',
  city: '',
  state: '',
  pincode: '',
});

const storeUniqueName = ref(useAuth().session.value?.storeUniqueName);
const isTaxInclude = ref(useAuth().session.value?.isTaxIncluded);
const isBarcodeInclude = ref(useAuth().session.value?.isBarcodeIncluded);
const isUserTrackInclude = ref(useAuth().session.value?.isUserTrackIncluded);
const pointsValue = ref(useAuth().session.value?.pointsValue || 0);

const productInputs = reactive([
  { key: 'name', label: 'Name', value: useAuth().session.value?.productInputs?.name  },
  { key: 'brand', label: 'Brand', value: useAuth().session.value?.productInputs?.brand  },
  { key: 'category', label: 'Category', value: useAuth().session.value?.productInputs?.category  },
  { key: 'subcategory', label: 'Subcategory', value: useAuth().session.value?.productInputs?.subcategory  },
  { key: 'description', label: 'Description', value: useAuth().session.value?.productInputs?.description },
])

const variantInputs = reactive([
  { key: 'name', label: 'Variant Name', value: useAuth().session.value?.variantInputs?.name  },
  { key: 'code', label: 'Code', value: useAuth().session.value?.variantInputs?.code  },
  { key: 'sprice', label: 'Selling Price', value: useAuth().session.value?.variantInputs?.sprice  },
  { key: 'pprice', label: 'Purchase Price', value: useAuth().session.value?.variantInputs?.pprice  },
  { key: 'dprice', label: 'Discount Price', value: useAuth().session.value?.variantInputs?.dprice  },
  { key: 'discount', label: 'Discount', value: useAuth().session.value?.variantInputs?.discount  },
  { key: 'qty', label: 'Quantity', value: useAuth().session.value?.variantInputs?.qty  },
  { key: 'sizes', label: 'Sizes', value: useAuth().session.value?.variantInputs?.sizes  },
  { key: 'images', label: 'Images', value: useAuth().session.value?.variantInputs?.images  },
])

watch(() => storeUniqueName.value, (newName) => {
  isNameChanged.value = newName !== useAuth().session.value?.storeUniqueName;
}, { immediate: true });

const { data: taken } = useFindUniqueCompany({
  where: computed(() => ({
    storeUniqueName: storeUniqueName.value
  })),
  select: {
    id: true
  }
});

const toast = useToast();

function accvalidate(state: AccountState): FormError[] {
  const errors: FormError[] = [];

  return errors;
}

function addvalidate(state: AddressState): FormError[] {
  const errors: FormError[] = [];
  if (!state.street) errors.push({ path: 'street', message: 'Street is required' });
  if (!state.city) errors.push({ path: 'city', message: 'City is required' });
  if (!state.locality) errors.push({ path: 'locality', message: 'Locality is required' });
  if (!state.pincode) errors.push({ path: 'pincode', message: 'Pincode is required' });
  return errors;
}

const { data: info, isLoading, error, refetch } = useFindUniqueCompany({
  where: {
    id: useAuth().session.value?.companyId 
  },
  select: {
    id: true,
    accHolderName: true,
    ifsc: true,
    accountNo: true,
    bankName: true,
    gstin: true,
    upiId:true,
    address: {
      select: {
        id: true,
        street: true,
        locality: true,
        city: true,
        state: true,
        pincode: true,
      },
    },
  },
});

watch(info, (newInfo) => {
  if (newInfo) {
    accstate.accHolderName = newInfo.accHolderName || '';
    accstate.ifsc = newInfo.ifsc || '';
    accstate.accountNo = newInfo.accountNo || '';
    accstate.bankName = newInfo.bankName || '';
    accstate.upiId = newInfo.upiId || '';
    accstate.gstin = newInfo.gstin || '';
    
    if (newInfo.address) {
      addstate.street = newInfo.address.street || '';
      addstate.locality = newInfo.address.locality || '';
      addstate.city = newInfo.address.city || '';
      addstate.state = newInfo.address.state || '';
      addstate.pincode = newInfo.address.pincode || '';
    }
  }
},{ deep: true, immediate: true });



async function onNameUpdate() {
  isUpdatingName.value = true;
  try {
    const res = await UpdateCompany.mutateAsync({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        storeUniqueName: storeUniqueName.value,
      },
    });
    toast.add({ title: 'Store name updated', icon: 'i-heroicons-check-circle' });
    isNameChanged.value = false;
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating store name', color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingName.value = false;
  }
}

async function onaccSubmit(event: FormSubmitEvent<AccountState>) {
    isUpdatingAccount.value = true;
  try {
    const res = await UpdateCompany.mutateAsync({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        accHolderName: accstate.accHolderName,
        ifsc: accstate.ifsc,
        accountNo: accstate.accountNo,
        bankName: accstate.bankName,
        gstin: accstate.gstin,
        upiId: accstate.upiId,
      }
    });
    toast.add({ title: 'Account details updated', color: 'green', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.log(error);
    toast.add({ title: 'Error updating account details', color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingAccount.value = false;
  }
}

async function onaddSubmit(event: FormSubmitEvent<AddressState>) {
    isUpdatingAddress.value = true;
  try {
    const res = await UpsertAddress.mutateAsync({
      where: {
        companyId: useAuth().session.value?.companyId,
      },
      create: {
        company: { connect: { id: useAuth().session.value?.companyId } },
        street: addstate.street,
        locality: addstate.locality,
        city: addstate.city,
        state: addstate.state,
        pincode: addstate.pincode,
      },
      update: {
        street: addstate.street,
        locality: addstate.locality,
        city: addstate.city,
        state: addstate.state,
        pincode: addstate.pincode,
      }
    });
    toast.add({ title: 'Address updated', color: 'green', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.log(error);
    toast.add({ title: 'Error updating address', color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingAddress.value = false;
  }
}

const onTaxIncludeChange = async () => {
  try {
    const res = await UpdateCompany.mutateAsync({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        isTaxIncluded: isTaxInclude.value,
      },
    });
    await updateIsTaxIncluded(isTaxInclude.value);
    toast.add({ title: 'Tax include updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating tax setting', color: 'red', icon: 'i-heroicons-x-circle' });
  }
};

const onBarcodeIncludeChange = async () => {
  try {
    const res = await UpdateCompany.mutateAsync({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        isBarcodeIncluded: isBarcodeInclude.value,
      },
    });
    await updateIsBarcodeIncluded(isBarcodeInclude.value);
    toast.add({ title: 'Barcode include updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating Barcode setting', color: 'red', icon: 'i-heroicons-x-circle' });
  }
};

const onUserTrackIncludeChange = async () => {
  try {
    const res = await UpdateCompany.mutateAsync({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        isUserTrackIncluded: isUserTrackInclude.value,
      },
    });
    await updateIsUserTrackIncluded(isUserTrackInclude.value);
    toast.add({ title: 'UserTrack include updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating UserTrack setting', color: 'red', icon: 'i-heroicons-x-circle' });
  }
};

const onInputChange = async () => {
  isUpdatingInputs.value = true;
  try {
    const productinputData = Object.fromEntries(productInputs.map(input => [input.key, input.value]));
    const variantinputData = Object.fromEntries(variantInputs.map(input => [input.key, input.value]));

    const res= await UpdateCompany.mutateAsync({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        productinput: {
          update: productinputData,
        },
        variantinput: {
          update: variantinputData,
        },
      },
    });
    console.log(productinputData, variantinputData);
    const resu = await updateSession(productinputData, variantinputData);
    console.log(resu);
    toast.add({ title: 'Product and Variant inputs updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating Product and Variant inputs', color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingInputs.value = false;
  }
};

const onPointsValueChange = async() => {
  isUpdatingPointsValue.value = true;
  try {
    const res = UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        pointsValue: pointsValue.value,
      },
    });
    await updatePointsValue(pointsValue.value);
    toast.add({ title: 'Points value updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating points value', color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingPointsValue.value = false;
  }
};


</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UFormGroup
      name="username"
      label="Store Unique Name"
      description="Unique name used for store URL."
      required
      class="grid grid-cols-2 gap-2"
      :ui="{ container: '', help: `mt-2 ${taken ? 'text-red-500 dark:text-red-400':'text-green-500 dark:text-green-400'}` }"
    >
      <template v-if="isNameChanged" #help>
        {{ taken ? 'This store name is already taken' : 'available' }}
      </template>
      <UInput
        v-model="storeUniqueName"
        type="text"
        autocomplete="off"
        size="md"
        input-class="ps-[128px]"
      >
        <template #leading>
          <span class="text-gray-500 dark:text-gray-400 text-sm">markit.com/store/</span>
        </template>
      </UInput>
    </UFormGroup>
    <div class="my-4 grid grid-cols-2 gap-2">
        <div></div>
        <div>
            <UButton
                label="Update Name"
                size="md"
                :loading="isUpdatingName"
                :disabled="!isNameChanged || !!taken"
                @click="onNameUpdate"
            />
        </div>
    </div>
    
    
    <UDivider class="mb-4" />

    <UFormGroup
      name="taxInclude"
      label="Include Tax in Price"
      description="Check if you want to include tax in the price."
      required
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"    
    >
      <UCheckbox v-model="isTaxInclude" @change="onTaxIncludeChange" />
    </UFormGroup>
    
    <UDivider class="mb-4" />

    <UFormGroup
      name="barcodeInclude"
      label="Include barcode in Billing"
      description="Check if you want to include barcode in the Billing."
      required
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"    
    >
      <UCheckbox v-model="isBarcodeInclude" @change="onBarcodeIncludeChange" />
    </UFormGroup>
    
    <UDivider class="mb-4" />

    <UFormGroup
      name="usersReport"
      label="Users Sales Track "
      description="Check if you want to track user sales."
      required
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"    
    >
      <UCheckbox v-model="isUserTrackInclude" @change="onUserTrackIncludeChange" />
    </UFormGroup>
  <UDivider class="mb-4" />
    <UFormGroup
      name="pointsValue"
      label="Points Value"
      description="What is the value of 1 point in your currency?"
      required
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"    
    >
      <UInput v-model="pointsValue" type="number" class="mb-4" />
      <UButton
        class="mt-2"
        label="Update"
        size="md"
        :loading="isUpdatingPointsValue"
        @click="onPointsValueChange"
    />
    </UFormGroup>
    
    <UDivider class="mb-4" />

    <UForm
      :state="accstate"
      :validate="accvalidate"
      :validate-on="['submit']"
      @submit="onaccSubmit"
    >
      <UFormGroup
        name="accountDetails"
        label="Account Details"
        description="Your bank account details used for payemt settlements."
        class="grid grid-cols-2 gap-2 mb-4"
        :ui="{ container: '' }"
      >
        <UInput
          v-model="accstate.accHolderName"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="Account Holder Name"
        />
        <UInput
          v-model="accstate.accountNo"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="Account No"
        />
        <UInput
          v-model="accstate.ifsc"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="IFSC Code"
        />
        <UInput
          v-model="accstate.bankName"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="Bank Name"
        />
        <UInput
          v-model="accstate.upiId"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="UPI ID"
        />
        <UInput
          v-model="accstate.gstin"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="GSTIN"
        />
        <UButton class="" type="submit" label="Save Account" :loading="isUpdatingAccount"/>
      </UFormGroup>
    </UForm>

    <UDivider class="mb-4" />

    <UForm
      :state="addstate"
      :validate="addvalidate"
      :validate-on="['submit']"
      @submit="onaddSubmit"
    >
      <UFormGroup
        name="addressDetails"
        label="Address Details"
        description="Your Store address that will be seen by clients"
        class="grid grid-cols-2 gap-2 mb-4"
        :ui="{ container: '' }"
      >
        <UInput
          v-model="addstate.street"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Street"
        />
        <UInput
          v-model="addstate.locality"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Locality"
        />
        <UInput
          v-model="addstate.city"
          type="text"
          class="mb-4"
          size="md"
          placeholder="City"
        />
        <UInput
          v-model="addstate.state"
          type="text"
          class="mb-4"
          size="md"
          placeholder="State"
        />
        <UInput
          v-model="addstate.pincode"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Pincode"
        />
        <UButton class="" type="submit" label="Save Address" :loading="isUpdatingAccount"/>
      </UFormGroup>
    </UForm>
    <UDivider class="mb-4" />

    <!-- Product Inputs Section -->
<div class="mb-6">
  <h2 class="text-lg font-semibold mb-2">Product Inputs</h2>
  <div class="grid grid-cols-2 gap-4">
    <div
      v-for="(input, index) in productInputs"
      :key="input.key"
      class="flex items-center justify-between border px-3 py-2 rounded-md"
    >
      <label class="text-sm font-medium">{{ input.label }}</label>
      <UCheckbox v-model="input.value" />
    </div>
  </div>
</div>

    <UDivider class="my-4" />

<!-- Variant Inputs Section -->
<div class="mb-6">
  <h2 class="text-lg font-semibold mb-2">Variant Inputs</h2>
  <div class="grid grid-cols-2 gap-4">
    <div
      v-for="(input, index) in variantInputs"
      :key="input.key"
      class="flex items-center justify-between border px-3 py-2 rounded-md"
    >
      <label class="text-sm font-medium">{{ input.label }}</label>
      <UCheckbox v-model="input.value" />
    </div>
  </div>
</div>

<div class="text-end">
  <UButton class="mt-4 w-fit" @click="onInputChange" label="Save Inputs" :loading="isUpdatingInputs" />
</div>

  </UDashboardPanelContent>
</template>