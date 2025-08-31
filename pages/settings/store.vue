<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '#ui/types';
import { useUpdateCompany, useFindUniqueCompany, useUpsertAddress } from '~/lib/hooks';
import { v4 as uuidv4 } from 'uuid';
import AwsService from '~/composables/aws';

interface ImageData {
    file: File;
    uuid: string;
}

const UpdateCompany = useUpdateCompany();
const UpsertAddress = useUpsertAddress();
const useAuth = () => useNuxtApp().$auth;
const awsService = new AwsService();

const fileRef = ref<HTMLInputElement>();
const isNameChanged = ref(false);
const isDescriptionChanged = ref(false);
const isImageChanged = ref(false);

const selectedFile = ref<ImageData | null>(null);

const isUpdatingName = ref(false);
const isUpdatingAddress = ref(false);
const isUpdatingAccount = ref(false);
const isUpdatingInputs = ref(false);
const isUpdatingPointsValue = ref(false);
const isUpdatingDescription = ref(false);
const isUpdatingLogo = ref(false);


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
  lat: number | null;
  lng: number | null;
  placeId: string;
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
  lat:null,
  lng:null,
  placeId: '',
});

const onLocationSelected = (location) => {
  console.log('Selected location:', location);
  addstate.street = location.street;
  addstate.locality = location.locality;
  addstate.city = location.city;
  addstate.state = location.state;
  addstate.pincode = location.pincode;
  addstate.lat = location.lat;
  addstate.lng = location.lng;
  addstate.placeId = location.placeId;
};

const storeUniqueName = ref(useAuth().session.value?.storeUniqueName);
const storeName = ref(useAuth().session.value?.companyName);
const storeLogo = ref(useAuth().session.value?.logo);
const storeDescription = ref(useAuth().session.value?.description || '');
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
watch(() => storeDescription.value, (newDescription) => {
  isDescriptionChanged.value = newDescription !== useAuth().session.value?.description;
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
      addstate.lat = newInfo.address.lat || null;
      addstate.lng = newInfo.address.lng || null;
      addstate.placeId = newInfo.address.placeId || '';
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

async function onDescriptionUpdate() {
  isUpdatingDescription.value = true;
  try {
    const res = await UpdateCompany.mutateAsync({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        description: storeDescription.value,  
      },
    });
    toast.add({ title: 'Store description updated', icon: 'i-heroicons-check-circle' });
    isUpdatingDescription.value = false;
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating store description', color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingDescription.value = false;
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
        lat: addstate.lat,
        lng: addstate.lng,
        placeId: addstate.placeId,
      },
      update: {
        street: addstate.street,
        locality: addstate.locality,
        city: addstate.city,
        state: addstate.state,
        pincode: addstate.pincode,
        lat: addstate.lat,
        lng: addstate.lng,
        placeId: addstate.placeId,
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


const onLogoUpdate = async () => {
  isUpdatingLogo.value = true;
    try{
    await UpdateCompany.mutateAsync({
        where: {
            id: useAuth().session.value?.companyId,
        },
        data: {
            ...(selectedFile.value?.file && {
                logo: selectedFile.value?.uuid,
            }),
        }
    });


    
    if (selectedFile.value) {
        const base64 = await prepareFileForApi(selectedFile.value.file);
        const base64file = { base64, uuid: selectedFile.value.uuid };

        console.log(base64file);

        await awsService.uploadBase64File(base64file.base64, base64file.uuid);
    }


}catch(error){
    console.error(error);
    toast.add({
        title: 'Error updating profile',
        icon: 'i-heroicons-exclamation-circle',
        color: 'red',
    });
}finally {
        isUpdatingLogo.value = false;
        await useAuth().updateSession();
        toast.add({
            title: 'Profile updated successfully',
            icon: 'i-heroicons-check-circle',
            color: 'green',
        });
    }

};


function onFileClick() {
    fileRef.value?.click();
}

function handleAddImageChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    isImageChanged.value = true
    if (files && files.length > 0) {
        const file = files[0]; // Take only the first file
        const uuid = uuidv4();
        selectedFile.value = { file, uuid };
    }
}


const previewUrl = computed(() => {
  if (selectedFile.value?.file) {
    return URL.createObjectURL(selectedFile.value.file);
  }
  return null;
});



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
 
    <UDivider class="mb-4" />

    <UFormGroup
      name="logo"
      label="Logo"
      class="grid grid-cols-2 gap-2"
      help="JPG, GIF or PNG. 1MB Max."
      :ui="{
          container: 'flex flex-wrap items-center gap-3',
          help: 'mt-0',
      }"
  >
      <UAvatar v-if="previewUrl" :src="previewUrl" :alt="storeName" size="lg" />
      <UAvatar v-else :src="`https://images.markit.co.in/${storeLogo|| ''}`" :alt="storeName" size="lg" />

      <UButton
          label="Choose"
          color="white"
          size="md"
          @click="onFileClick"
      />

      <input
          ref="fileRef"
          type="file"
          class="hidden"
          accept=".jpg, .jpeg, .png, .gif"
          @change="handleAddImageChange"
      />
      
  </UFormGroup>
    <div class="my-4 grid grid-cols-2 gap-2">
        <div></div>
        <div>
            <UButton
              label="Update Logo"
              size="md"
              :loading="isUpdatingLogo"
              :disabled="!isImageChanged"
              @click="onLogoUpdate"
            />
        </div>
    </div>

    <UDivider class="mb-4" />


    <UFormGroup
      name="description"
      label="Store Description"
      description="Description of your store."
      required
      class="grid grid-cols-2 gap-2"
      :ui="{ container: '', help: `mt-2 ${taken ? 'text-red-500 dark:text-red-400':'text-green-500 dark:text-green-400'}` }"
    >
          <UInput
        v-model="storeDescription"
        :maxlength="20"
      >
        <template #trailing>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ storeDescription?.length }}/{{ 20 }}</span>
        </template>
      </UInput>
    </UFormGroup>
    <div class="my-4 grid grid-cols-2 gap-2">
        <div></div>
        <div>
            <UButton
                label="Update Description"
                size="md"
                :loading="isUpdatingDescription"
                :disabled="!isDescriptionChanged"
                @click="onDescriptionUpdate"
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

    <UFormGroup
  name="map"
  label="Pick Store Location"
  class="grid grid-cols-2 gap-2 mb-4"
  :ui="{ container: '' }"
>
  <div class="col-span-2 ">
    <MapLocationPicker @locationSelected="onLocationSelected" />
  </div>
</UFormGroup>


    <UForm
      :state="addstate"
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
          disabled
        />
        <UInput
          v-model="addstate.locality"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Locality"
          disabled
        />
        <UInput
          v-model="addstate.city"
          type="text"
          class="mb-4"
          size="md"
          placeholder="City"
          disabled
        />
        <UInput
          v-model="addstate.state"
          type="text"
          class="mb-4"
          size="md"
          placeholder="State"
          disabled
        />
        <UInput
          v-model="addstate.pincode"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Pincode"
          disabled
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