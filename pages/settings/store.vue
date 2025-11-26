<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '#ui/types';
import { useUpdateCompany, useFindUniqueCompany, useUpsertAddress } from '~/lib/hooks';
import { v4 as uuidv4 } from 'uuid';
import AwsService from '~/composables/aws';

interface ImageData {
    file: File;
    uuid: string;
}

const UpdateCompany = useUpdateCompany({ optimisticUpdate: true });
const UpsertAddress = useUpsertAddress({ optimisticUpdate: true });
const useAuth = () => useNuxtApp().$auth;
const awsService = new AwsService();

const fileRef = ref<HTMLInputElement>();
const isNameChanged = ref(false);
const isDescriptionChanged = ref(false);
const isThankYouNoteChanged = ref(false);
const isRefundPolicyChanged = ref(false);
const isReturnPolicyChanged = ref(false);
const isImageChanged = ref(false);
const isCategoryChanged = ref(false);
const isDeliveryConfigChanged = ref(false);
const isPointChanged = ref(false);
const isTimeChanged = ref(false);
const isAccountStateChanged = ref(false);
const isAddressStateChanged = ref(false);
const isInputsChanged = ref(false);
const isDeliveryTypeChanged =ref(false)

const selectedFile = ref<ImageData | null>(null);

const isUpdatingName = ref(false);
const isUpdatingAddress = ref(false);
const isUpdatingAccount = ref(false);
const isUpdatingInputs = ref(false);
const isUpdatingPointsValue = ref(false);
const isUpdatingtiming = ref(false);
const isUpdatingDescription = ref(false);
const isUpdatingLogo = ref(false);
const isUpdatingCategory = ref(false);
const isUpdatingDeliveryConfig = ref(false);
const isUpdatingDeliveryType = ref(false);


const category = ['Men','Women','Girl','Boy']

const selectedCategory = ref(useAuth().session.value?.category || [])



interface AccountState {
  accHolderName?: string;
  ifsc?: string;
  accountNo?: string;
  bankName?: string;
  upiId?: string;
  gstin?: string;
}

const storePhone = ref(useAuth().session.value?.companyPhone || '');
const isPhoneChanged = ref(false);
const isUpdatingPhone = ref(false);

watch(() => storePhone.value, (newPhone) => {
  isPhoneChanged.value = newPhone !== useAuth().session.value?.companyPhone;
}, { immediate: true });



interface AddressState {
  street: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  placeId: string;
  formattedAddress: string;
  name: string;
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
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  lat:null,
  lng:null,
  placeId: '',
  formattedAddress:'ted',
  name:'',
});
const timing = reactive<{open:string | undefined,close:string | undefined}>({
 open: useAuth().session.value?.openTime,
 close: useAuth().session.value?.closeTime
});

const onLocationSelected = (location) => {
  console.log('Selected location:', location);
  addstate.city = location.city;
  addstate.state = location.state;
  addstate.pincode = location.pincode;
  addstate.lat = location.lat;
  addstate.lng = location.lng;
  addstate.placeId = location.placeId;
  addstate.formattedAddress = location.formattedAddress;
  addstate.name = location.name;
};

const storeUniqueName = ref(useAuth().session.value?.storeUniqueName);
const storeName = ref(useAuth().session.value?.companyName);
const storeLogo = ref(useAuth().session.value?.logo);
const storeDescription = ref(useAuth().session.value?.description || '');
const storeThankYouNote = ref(useAuth().session.value?.thankYouNote || '');
const storeRefundPolicy = ref(useAuth().session.value?.refundPolicy || '');
const storeReturnPolicy = ref(useAuth().session.value?.returnPolicy || '');
const isTaxInclude = ref(useAuth().session.value?.isTaxIncluded);
const isAiImage = ref(useAuth().session.value?.isAiImage);
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
  { key: 'button', label: 'Button', value: useAuth().session.value?.variantInputs?.button  },
])



const deliveryType = ref<string[]>(useAuth().session.value?.deliveryType || [])
const deliveryMode = ref<string[]>(useAuth().session.value?.deliveryMode || [])
const fundDeliveryFees = ref<boolean>(useAuth().session.value?.fundDeliveryFees || false)

const deliveryRadius = ref<number | null>(useAuth().session.value?.deliveryRadius || null)
const deliveryFeesPerKm = ref<number | null>(useAuth().session.value?.deliveryFeesPerKm || null)
const waitingTime = ref<number | null>(useAuth().session.value?.waitingTime || null)
const waitingChargesPerMin = ref<number | null>(useAuth().session.value?.waitingChargesPerMin || null)
const minDeliveryCharges = ref<number | null>(useAuth().session.value?.minDeliveryCharges || null)

const deliveryDiscountThreshold = ref<number | null>(useAuth().session.value?.deliveryDiscountThreshold || null)
const deliveryDiscountAmount = ref<number | null>(useAuth().session.value?.deliveryDiscountAmount || null)

// Dropdown options
const deliveryModeOptions = ['markit','self']
const deliveryTypeOptions = ['trynbuy','booking','delivery']

// Check which mode is selected
const isMarkit = computed(() => deliveryMode.value.includes('markit'))
const isSelf = computed(() => deliveryMode.value.includes('self'))


watch(() => storeUniqueName.value, (newName) => {
  isNameChanged.value = newName !== useAuth().session.value?.storeUniqueName;
}, { immediate: true });

watch(() => storeDescription.value, (newDescription) => {
  isDescriptionChanged.value = newDescription !== useAuth().session.value?.description;
}, { immediate: true });
watch(() => storeThankYouNote.value, (newThankYouNote) => {
  isThankYouNoteChanged.value = newThankYouNote !== useAuth().session.value?.thankYouNote;
}, { immediate: true });
watch(() => storeRefundPolicy.value, (newRefundPolicy) => {
  isRefundPolicyChanged.value = newRefundPolicy !== useAuth().session.value?.refundPolicy;
}, { immediate: true });
watch(() => storeReturnPolicy.value, (newReturnPolicy) => {
  isReturnPolicyChanged.value = newReturnPolicy !== useAuth().session.value?.returnPolicy;
}, { immediate: true });
watch(() => selectedCategory.value, (newCategory) => {
  isCategoryChanged.value = newCategory !== useAuth().session.value?.category;
}, { immediate: true });

watch(() => deliveryMode.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.deliveryMode;
}, { immediate: true });
watch(() => fundDeliveryFees.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.fundDeliveryFees;
}, { immediate: true });
watch(() => deliveryRadius.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.deliveryRadius;
}, { immediate: true });
watch(() => deliveryFeesPerKm.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.deliveryFeesPerKm;
}, { immediate: true });
watch(() => waitingTime.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.waitingTime;
}, { immediate: true });
watch(() => waitingChargesPerMin.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.waitingChargesPerMin;
}, { immediate: true });
watch(() => minDeliveryCharges.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.minDeliveryCharges;
}, { immediate: true });
watch(() => deliveryDiscountThreshold.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.deliveryDiscountThreshold;
}, { immediate: true });
watch(() => deliveryDiscountAmount.value, (newConfig) => {
  isDeliveryConfigChanged.value = newConfig !== useAuth().session.value?.deliveryDiscountAmount;
}, { immediate: true });
watch(() => deliveryType.value, (newType) => {
  isDeliveryTypeChanged.value = newType.sort().toString() !== (useAuth().session.value?.deliveryType || []).sort().toString();
}, { immediate: true });

watch(() => pointsValue.value, (newPointsValue) => {
  isPointChanged.value = newPointsValue !== useAuth().session.value?.pointsValue;
}, { immediate: true });
watch(timing, (newTiming) => {
  isTimeChanged.value = 
    newTiming.open !== useAuth().session.value?.openTime ||
    newTiming.close !== useAuth().session.value?.closeTime;
}, { deep: true, immediate: true });
watch(accstate, (newState) => {
  isAccountStateChanged.value = 
    newState.accHolderName !== (useAuth().session.value?.accHolderName || '') ||
    newState.ifsc !== (useAuth().session.value?.ifsc || '') ||
    newState.accountNo !== (useAuth().session.value?.accountNo || '') ||
    newState.bankName !== (useAuth().session.value?.bankName || '') ||
    newState.upiId !== (useAuth().session.value?.upiId || '') ||
    newState.gstin !== (useAuth().session.value?.gstin || '');
}, { deep: true, immediate: true });

watch(addstate, (newState) => {
  isAddressStateChanged.value = 
    newState.street !== (useAuth().session.value?.address?.street || '') ||
    newState.landmark !== (useAuth().session.value?.address?.landmark || '') ||
    newState.city !== (useAuth().session.value?.address?.city || '') ||
    newState.state !== (useAuth().session.value?.address?.state || '') ||
    newState.pincode !== (useAuth().session.value?.address?.pincode || '') ||
    newState.lat !== (useAuth().session.value?.address?.lat || null) ||
    newState.lng !== (useAuth().session.value?.address?.lng || null) ||
    newState.formattedAddress !== (useAuth().session.value?.address?.formattedAddress || '') ||
    newState.name !== (useAuth().session.value?.address?.name || '');
}, { deep: true, immediate: true });

watch(productInputs, (newInputs) => {
  isInputsChanged.value = newInputs.some(input => input.value !== useAuth().session.value?.productInputs?.[input.key]);
}, { deep: true, immediate: true });
watch(variantInputs, (newInputs) => {
  isInputsChanged.value = isInputsChanged.value || newInputs.some(input => input.value !== useAuth().session.value?.variantInputs?.[input.key]);
}, { deep: true, immediate: true });

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
        landmark: true,
        city: true,
        state: true,
        pincode: true,
        formattedAddress:true,
        name:true,
        lat:true,
        lng:true,
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
      addstate.formattedAddress = newInfo.address.formattedAddress || '';
      addstate.name = newInfo.address.name || '';
      addstate.landmark = newInfo.address.landmark || '';
      addstate.city = newInfo.address.city || '';
      addstate.state = newInfo.address.state || '';
      addstate.pincode = newInfo.address.pincode || '';
      addstate.lat = newInfo.address.lat || null;
      addstate.lng = newInfo.address.lng || null;
    }
  }
},{ deep: true, immediate: true });



function onNameUpdate() {
  isUpdatingName.value = true;
  try {
  if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
   UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        storeUniqueName: storeUniqueName.value,
      },
    });
    toast.add({ title: 'Store name updated', icon: 'i-heroicons-check-circle' });
    isNameChanged.value = false;
    updateStoreUniqueName(storeUniqueName.value)
  } catch (error) {
    toast.add({ title: 'Error updating store name',
                description: error.statusMessage,
                color: 'red', 
                icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingName.value = false;
  }
}

function onPhoneUpdate() {
  isUpdatingPhone.value = true;
  try {
  if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        phone: storePhone.value,
      },
    });
    toast.add({ title: 'Store phone updated', icon: 'i-heroicons-check-circle' });
    isPhoneChanged.value = false;
    updateStorePhone(storePhone.value)
  } catch (error) {
    toast.add({ title: 'Error updating store phone',description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingPhone.value = false;
  }
}

function onNotesUpdate() {
  isUpdatingDescription.value = true;
  try {
  if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        description: storeDescription.value,  
        thankYouNote: storeThankYouNote.value,  
        refundPolicy: storeRefundPolicy.value,  
        returnPolicy: storeReturnPolicy.value,  
      },
    });
    toast.add({ title: 'Store description updated', icon: 'i-heroicons-check-circle' });
    isUpdatingDescription.value = false;
    updateStoreNote(
      storeDescription.value,
      storeThankYouNote.value,
      storeRefundPolicy.value,
      storeReturnPolicy.value
    )
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating store description', color: 'red',description: error.statusMessage, icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingDescription.value = false;
  }
}

function onaccSubmit(event: FormSubmitEvent<AccountState>) {
    isUpdatingAccount.value = true;
  try {
  if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
  
    UpdateCompany.mutate({
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
    toast.add({ title: 'Account details updated',description: error.statusMessage, color: 'green', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.log(error);
    toast.add({ title: 'Error updating account details', color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingAccount.value = false;
  }
}

function onaddSubmit(event: FormSubmitEvent<AddressState>) {
    isUpdatingAddress.value = true;
  try {
  if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
  UpsertAddress.mutate({
      where: {
        companyId: useAuth().session.value?.companyId,
      },
      create: {
        company: { connect: { id: useAuth().session.value?.companyId } },
        street: addstate.street,
        formattedAddress:addstate.formattedAddress,
        name:addstate.name,
        landmark: addstate.landmark,
        city: addstate.city,
        state: addstate.state,
        pincode: addstate.pincode,
        lat: addstate.lat,
        lng: addstate.lng,
        placeId: addstate.placeId,
      },
      update: {
        street: addstate.street,
        formattedAddress: addstate.formattedAddress,
        name: addstate.name,
        landmark: addstate.landmark,
        city: addstate.city,
        state: addstate.state,
        pincode: addstate.pincode,
        lat: addstate.lat,
        lng: addstate.lng,
        placeId: addstate.placeId,
      }
    });
    updateAddress(addstate);
    toast.add({ title: 'Address updated', color: 'green', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error updating address',description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingAddress.value = false;
  }
}

const onTaxIncludeChange = () => {
  try {
    if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        isTaxIncluded: isTaxInclude.value,
      },
    });
    updateIsTaxIncluded(isTaxInclude.value);
    toast.add({ title: 'Tax include updated', description: error.statusMessage, icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error updating tax setting', color: 'red', icon: 'i-heroicons-x-circle' });
  }
};



const onAiImageChange = () => {
  try {
    if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        isAiImage: isAiImage.value,
      },
    });
    updateIsAiImage(isAiImage.value);
    toast.add({ title: 'AI Image setting updated', description: error.statusMessage, icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error updating AI Image setting', color: 'red', icon: 'i-heroicons-x-circle' });
  }
};


const onUserTrackIncludeChange = () => {
  try {
      if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        isUserTrackIncluded: isUserTrackInclude.value,
      },
    });
    updateIsUserTrackIncluded(isUserTrackInclude.value);
    toast.add({ title: 'UserTrack include updated',description: error.statusMessage, icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error updating UserTrack setting', color: 'red', icon: 'i-heroicons-x-circle' });
  }
};

const onInputChange = () => {
  isUpdatingInputs.value = true;
  try {
      if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    const productinputData = Object.fromEntries(productInputs.map(input => [input.key, input.value]));
    const variantinputData = Object.fromEntries(variantInputs.map(input => [input.key, input.value]));

    const res= UpdateCompany.mutate({
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
    updateSession(productinputData, variantinputData);
    toast.add({ title: 'Product and Variant inputs updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error updating Product and Variant inputs',description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingInputs.value = false;
  }
};

const onPointsValueChange = () => {
  isUpdatingPointsValue.value = true;
  try {
      if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        pointsValue: pointsValue.value,
      },
    });
   updatePointsValue(pointsValue.value);
    toast.add({ title: 'Points value updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error updating points value',description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingPointsValue.value = false;
  }
};
const ontimingChange = () => {
  isUpdatingtiming.value = true;
  try {
      if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
   UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        openTime: timing.open,
        closeTime: timing.close,
      },
    });
    updateTimeValue(timing.open,timing.close);
    toast.add({ title: 'Timing updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error updating Timing',description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingtiming.value = false;
  }
};

const onCategoryChange = () => {
  isUpdatingCategory.value = true;
  try {
      if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
   UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        category: selectedCategory.value,
      },
    });
    updateCategoryValue(selectedCategory.value);
    toast.add({ title: 'Category updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating Category',description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingCategory.value = false;
  }
};


const onLogoUpdate = async () => {
  isUpdatingLogo.value = true;
    try{
        if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    UpdateCompany.mutate({
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
        await awsService.uploadBase64File(base64file.base64, base64file.uuid);
    }

updateLogo(selectedFile.value?.uuid);
toast.add({ title: 'Logo updated', icon: 'i-heroicons-check-circle' });
}catch(error){
    console.error(error);
    toast.add({
        title: 'Error updating profile',
        icon: 'i-heroicons-exclamation-circle',
        color: 'red',
        description: error.statusMessage,
    });
}finally {
        isUpdatingLogo.value = false;
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

const saveDeliveryConfig = () => {
  isUpdatingDeliveryConfig.value = true;
  const payload = {
    deliveryMode: deliveryMode.value,
    fundDeliveryFees: fundDeliveryFees.value,
    deliveryRadius: deliveryRadius.value,
    deliveryFeesPerKm: deliveryFeesPerKm.value,
    waitingTime: waitingTime.value,
    waitingChargesPerMin: waitingChargesPerMin.value,
    minDeliveryCharges: minDeliveryCharges.value,
    deliveryDiscountThreshold: deliveryDiscountThreshold.value,
    deliveryDiscountAmount: deliveryDiscountAmount.value
  }
   isUpdatingAccount.value = true;
  try {
      if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        deliveryMode: deliveryMode.value,
        fundDeliveryFees: fundDeliveryFees.value,
        deliveryRadius: deliveryRadius.value,
        deliveryFeesPerKm: deliveryFeesPerKm.value,
        waitingTime: waitingTime.value,
        waitingChargesPerMin: waitingChargesPerMin.value,
        minDeliveryCharges: minDeliveryCharges.value,
        deliveryDiscountThreshold: deliveryDiscountThreshold.value,
        deliveryDiscountAmount: deliveryDiscountAmount.value
      }
    });
    updateDeliveryConfig(payload);
    toast.add({ title: 'Account details updated', color: 'green', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.log(error);
    toast.add({ title: 'Error updating account details',description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingDeliveryConfig.value = false;
  }
}

const onDeliveryTypeChange = () => {
  isUpdatingDeliveryType.value = true;
  try {
      if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
   UpdateCompany.mutate({
      where: {
        id: useAuth().session.value?.companyId,
      },
      data: {
        deliveryType: deliveryType.value,
      },
    });
    updateDeliveryType(deliveryType.value);
    toast.add({ title: 'Delivery Type updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    console.error(error);
    toast.add({ title: 'Error updating Delivery Type',description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingDeliveryType.value = false;
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
              :disabled="!isNameChanged"
              @click="onNameUpdate"
            />
        </div>
    </div>
 
    <UDivider class="mb-4" />

    <UFormGroup
      name="phone"
      label="Store Phone"
      description="Phone number for your store"
      required
      class="grid grid-cols-2 gap-2"
    >
      <UInput
        v-model="storePhone"
        type="tel"
        autocomplete="tel"
        size="md"
        placeholder="Enter store phone number"
      >
        <template #leading>
          <span class="text-gray-500 dark:text-gray-400 text-sm">+91</span>
        </template>
      </UInput>
    </UFormGroup>

      <div class="my-4 grid grid-cols-2 gap-2">
        <div></div>
        <div>
            <UButton
              label="Update Phone"
              size="md"
              :loading="isUpdatingPhone"
              :disabled="!isPhoneChanged"
              @click="onPhoneUpdate"
            />
        </div>
    </div>
 
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
      <UAvatar v-else :src="`https://images.markit.co.in/${storeLogo}`" :alt="storeName" size="lg" />

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
        name="categories"
        label="Categories"
        description="Your Store Categories"
        class="grid grid-cols-2 gap-2 mb-4"
        :ui="{ container: '' }"
      >
       <USelectMenu v-model="selectedCategory" :options="category" multiple placeholder="Select Category" />
        <UButton class="my-2" type="submit" label="Save Categories" :loading="isUpdatingCategory" @click="onCategoryChange" :disabled="!isCategoryChanged"/>
      </UFormGroup>
      <UDivider class="mb-4" />
      <UFormGroup
        name="deliveryType"
        label="Delivery Type"
        description="Your Store Delivery Type"
        class="grid grid-cols-2 gap-2 mb-4"
        :ui="{ container: '' }"
      >
       <USelectMenu v-model="deliveryType" :options="deliveryTypeOptions" multiple placeholder="Select Delivery Type" />
        <UButton class="my-2" type="submit" label="Save Delivery Type" :loading="isUpdatingDeliveryType" @click="onDeliveryTypeChange" :disabled="!isDeliveryTypeChanged"/>
      </UFormGroup>


    <UDivider class="mb-4" />
      <UFormGroup
        name="deliveryMode"
        label="Delivery Mode"
        description="Choose your delivery mode"
        class="grid grid-cols-2 gap-2 mb-4"
        :ui="{ container: '' }"
    >
    <USelectMenu
      v-model="deliveryMode"
      :options="deliveryModeOptions"
      multiple
      placeholder="Select delivery mode"
    />
  </UFormGroup>

  <UFormGroup
      name="deliveryRadius"
        label="Delivery Radius (km)"
        class="grid grid-cols-2 gap-2 mb-4"
          :ui="{ container: '' }"
        >
      <UInput v-model="deliveryRadius" type="number" placeholder="Enter radius in km" />
    </UFormGroup>

  <!-- If Markit → Only Fund Delivery Fees -->
  <UFormGroup
    v-if="isMarkit"
    name="fundDeliveryFees"
    label="Fund Delivery Fees"
    description="Enable if you want to pay for customers delivery fees"
     class="grid grid-cols-2 gap-2"
        :ui="{ container: '' }"
  >
    <UCheckbox v-model="fundDeliveryFees" label="Fund Delivery Fees" />
    
  </UFormGroup>

  <!-- If Self → Show all fields -->
  <div v-if="isSelf" >

    <UFormGroup
      name="deliveryFeesPerKm"
      label="Delivery Fees / Km"
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"
    >
      <UInput v-model="deliveryFeesPerKm" type="number" placeholder="Enter fee per km" />
    </UFormGroup>

    <UFormGroup
      name="waitingTime"
      label="Free Waiting Time (min)"
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"
    >
      <UInput v-model="waitingTime" type="number" placeholder="Enter minutes" />
    </UFormGroup>

    <UFormGroup
      name="waitingChargesPerMin"
      label="Waiting Charges / Min"
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"
    >
      <UInput v-model="waitingChargesPerMin" type="number" placeholder="Enter charge per minute" />
    </UFormGroup>

    <UFormGroup
      name="minDeliveryCharges"
      label="Minimum Delivery Charges"
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"
    >
      <UInput v-model="minDeliveryCharges" type="number" placeholder="Enter minimum delivery fee" />
    </UFormGroup>

    <UFormGroup
      name="deliveryDiscountThreshold"
      label="Deduction Threshold Amount"
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"
    >
      <UInput v-model="deliveryDiscountThreshold" type="number" placeholder="Enter deduction amount" />
    </UFormGroup>

    <UFormGroup
      name="deliveryDiscountAmount"
      label="Deduction Per Threshold Amount"
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"
    >
      <UInput v-model="deliveryDiscountAmount" type="number" placeholder="Enter deduction per threshold amount" />
    </UFormGroup>
    
  </div>
  <UFormGroup  class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }">
     <UButton 
     class="mt-4" 
     label="Save Delivery Settings" 
     @click="saveDeliveryConfig" 
     :disabled="!isDeliveryConfigChanged"
     :loading="isUpdatingDeliveryConfig"
     />
  </UFormGroup>


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
        :maxlength="40"
        class="mb-5"
      >
        <template #trailing>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ storeDescription?.length }}/{{ 40 }}</span>
        </template>
      </UInput>
    </UFormGroup>

    <UFormGroup
      name="thankYouNote"
      label="Thank You Note"
      description="Displayed after order completion."
      required
      class="grid grid-cols-2 gap-2"
    >
      <UInput
        v-model="storeThankYouNote"
        :maxlength="40"
        class="mb-5"
      >
        <template #trailing>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ storeThankYouNote?.length }}/{{ 40 }}</span>
        </template>
      </UInput>
    </UFormGroup>

    <UFormGroup
      name="refundPolicy"
      label="Refund Policy"
      description="Refund policy of your store."
      required
      class="grid grid-cols-2 gap-2"
    >
      <UInput
        v-model="storeRefundPolicy"
        :maxlength="40"
        class="mb-5"
      >
        <template #trailing>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ storeRefundPolicy?.length }}/{{ 40 }}</span>
        </template>
      </UInput>
    </UFormGroup>

    <UFormGroup
      name="returnPolicy"
      label="Return Policy"
      description="Return policy of your store."
      required
      class="grid grid-cols-2 gap-2"
    >
      <UInput
        v-model="storeReturnPolicy"
        :maxlength="40"
        class="mb-5"
      >
        <template #trailing>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ storeReturnPolicy?.length }}/{{ 40 }}</span>
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
                :disabled="!(isDescriptionChanged || isThankYouNoteChanged || isRefundPolicyChanged || isReturnPolicyChanged)"
                @click="onNotesUpdate"
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
      name="aiImage"
      label="AI Image"
      description="Check if you want to enable AI Image generation."
      required
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"    
    >
      <UCheckbox v-model="isAiImage" @change="onAiImageChange" />
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
        label="Update Points"
        size="md"
        :loading="isUpdatingPointsValue"
        @click="onPointsValueChange"
        :disabled="!isPointChanged"
    />
    </UFormGroup>
    
    <UDivider class="mb-4" />

    <UFormGroup
      name="timing"
      label="Timing"
      description="Your opening and closing time?"
      required
      class="grid grid-cols-2 gap-2 mb-4"
      :ui="{ container: '' }"    
    >
    <div class="mb-2">
      <div class="text-sx text-gray-500">Open time</div>
      <UInput v-model="timing.open" type="time" label="Open time" class="mb-4" />
    </div>
    <div class="mb-2">
      <div class="text-sx text-gray-500">Close time</div>
     <UInput v-model="timing.close" type="time" label="Close time" class="mb-4" />
    </div>

      
      <UButton
        class="mt-2"
        label="Update Timing"
        size="md"
        :loading="isUpdatingtiming"
        :disabled="!isTimeChanged"
        @click="ontimingChange"
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
        <div class="text-sx text-gray-500">Account Holder Name</div>
        <UInput
          v-model="accstate.accHolderName"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          label="Account Holder Name"
          placeholder="Account Holder Name"
        />
        <div class="text-sx text-gray-500">Account No</div>
        <UInput
          v-model="accstate.accountNo"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="Account No"
        />
         <div class="text-sx text-gray-500">IFSC Code</div>
        <UInput
          v-model="accstate.ifsc"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="IFSC Code"
        />
         <div class="text-sx text-gray-500">Bank Name</div>
        <UInput
          v-model="accstate.bankName"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="Bank Name"
        />
         <div class="text-sx text-gray-500">UPI ID</div>
        <UInput
          v-model="accstate.upiId"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="UPI ID"
        />
         <div class="text-sx text-gray-500">GSTIN</div>
        <UInput
          v-model="accstate.gstin"
          type="text"
          class="mb-4"
          autocomplete="off"
          size="md"
          placeholder="GSTIN"
        />
        <UButton class="" type="submit" label="Save Account" :loading="isUpdatingAccount" :disabled="!isAccountStateChanged"/>
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



      <UFormGroup
        name="addressDetails"
        label="Address Details"
        description="Your Store address that will be seen by clients"
        class="grid grid-cols-2 gap-2 mb-4"
        :ui="{ container: '' }"
      >
      <div class="text-sx text-gray-500">Name</div>
        <UInput
          v-model="addstate.name"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Name"
          disabled
        />
         <div class="text-sx text-gray-500">Full address</div>
        <UInput
          v-model="addstate.formattedAddress"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Full address"
          disabled
        />
         <div class="text-sx text-gray-500">Street</div>
        <UInput
          v-model="addstate.street"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Street"
        />
         <div class="text-sx text-gray-500">Landmark</div>
        <UInput
          v-model="addstate.landmark"
          type="text"
          class="mb-4"
          size="md"
          placeholder="Landmark"
        />
        <UButton 
        class="" 
        type="submit" 
        label="Save Address" 
        :loading="isUpdatingAddress" 
        :disabled="!isAddressStateChanged"  
        @click="onaddSubmit"/>
      </UFormGroup>


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
  <UButton 
  class="mt-4 w-fit" 
  @click="onInputChange" 
  label="Save Inputs" 
  :loading="isUpdatingInputs" 
  :disabled="!isInputsChanged"
/>
</div>

  </UDashboardPanelContent>
</template>