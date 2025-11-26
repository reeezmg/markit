export const useAuth = () => useNuxtApp().$auth;

export const authLogin = async (email: string, password: string) => {
    const config = useRuntimeConfig();
    
    const res = await $fetch('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        credentials: 'include',
    });
    await useAuth().updateSession();
    return res;
};

export const authRegister = async (
    email: string,
    name: string,
    companyname: string,
    password: string,
    plan: string,
    type: string,
) => {
    const config = useRuntimeConfig();
    const res = await $fetch('/api/auth/register', {
        method: 'POST',
        body: { email, name, companyname, password, plan, type },

    });
    await authLogin(email, password);
    return res;
};

export const authForgetPassword = async (current_password: string, password: string) => {
    const config = useRuntimeConfig();
    const res = await $fetch('/api/auth/forgetPassword', {
        method: 'POST',
        body: {
            current_password,
            password,
            id: useAuth().session.value?.id,
        },

    });
    return res;
};

export const authLogout = async () => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/logout', {
        method: 'POST',

    });
    await useAuth().updateSession();
    await navigateTo('/login');
};

export const checkEmailExist = async (email: string) => {
    const config = useRuntimeConfig();
    const res = await $fetch('/api/auth/existinguser', {
        method: 'POST',
        body: { email },

    });
    return res;
};

export const updateCompanySession = async (
  id: string | undefined,
  cleanup: boolean | undefined,
  name: string | null | undefined,
  description: string | undefined,
  thankYouNote: string | undefined,
  refundPolicy: string | undefined,
  returnPolicy: string | undefined,
  companyPhone: string | undefined,
  image: string | null | undefined,
  code: string | undefined,
  storeUniqueName: string | undefined,
  isTaxIncluded: boolean | undefined,
  isUserTrackIncluded: boolean | undefined,
  companyId: string | undefined,
  companyType: string | undefined,
  companyName: string | undefined,
  pipelineId: string | undefined,
  role: string | undefined,
  pointsValue: number | undefined,
  currency: string | undefined,
  type: string,
  address: Record<string, any>,
  gstin: string,
  accHolderName: string,
  upiId: string,
  plan: string,
  logo: string | undefined,
  productInputs: Record<string, any>,
  variantInputs: Record<string, any>,
) => {
  const config = useRuntimeConfig();
  try{
  await $fetch('/api/auth/session', {
    method: 'PUT',
    body: {
      id,
      cleanup,
      name,
      description,
      thankYouNote,
      refundPolicy,
      returnPolicy,
      companyPhone,
      image,
      code,
      storeUniqueName,
      isTaxIncluded,
      isUserTrackIncluded,
      companyId,
      companyType,
      companyName,
      pipelineId,
      role,
      pointsValue,
      currency,
      type,
      address,
      gstin,
      accHolderName,
      upiId,
      plan,
      logo,
      productInputs,
      variantInputs,
    },
  });

  await useAuth().updateSession();
}catch(err){
    console.log(err)
}
};


export const updateStoreUniqueName = async (storeUniqueName: string) => {
    await $fetch('/api/auth/changeStoreUniqueName', {
        method: 'PUT',
        body: { storeUniqueName },

    });
    await useAuth().updateSession();
};
export const updateStorePhone = async (companyPhone: string) => {
    await $fetch('/api/auth/changeStorePhone', {
        method: 'PUT',
        body: { companyPhone },

    });
    await useAuth().updateSession();
};

export const updateStoreNote = async (description: string, thankYouNote: string, refundPolicy: string, returnPolicy: string) => {
    await $fetch('/api/auth/changeNotes', {
        method: 'PUT',
        body: { description, thankYouNote, refundPolicy, returnPolicy },

    });
    await useAuth().updateSession();
};

export const updateIsTaxIncluded = async (isTaxIncluded: boolean) => {
    await $fetch('/api/auth/changeIncludeTax', {
        method: 'PUT',
        body: { isTaxIncluded },

    });
    await useAuth().updateSession();
};

export const updateIsUserTrackIncluded = async (isUserTrackIncluded: boolean) => {
    await $fetch('/api/auth/changeIncludeUserTrack', {
        method: 'PUT',
        body: { isUserTrackIncluded },

    });
    await useAuth().updateSession();
};

export const updateSession = async (productinputData: any, variantinputData: any) => {
    await $fetch('/api/auth/changeInputs', {
        method: 'PUT',
        body: { productinputData, variantinputData },

    });
    await useAuth().updateSession();
    console.log('Session updated');
};

export const updateProfileDetails = async (name: string | null, email: string | null, image: string | null) => {
    await $fetch('/api/auth/changeprofiledetails', {
        method: 'PUT',
        body: { name, email, image },

    });
    await useAuth().updateSession();
    console.log('Session updated');
};

export const updatePointsValue = async (pointsValue: number) => {
    await $fetch('/api/auth/changePointsValue', {
        method: 'PUT',
        body: { pointsValue },

    });
    await useAuth().updateSession();
};
export const updateTimeValue = async (openTime: string, closeTime:string) => {
    await $fetch('/api/auth/changeTiming', {
        method: 'PUT',
        body: { openTime,closeTime },

    });
    await useAuth().updateSession();
};

export const updateCategoryValue = async (category: string[]) => {
    await $fetch('/api/auth/changeCategory', {
        method: 'PUT',
        body: { category },

    });
    await useAuth().updateSession();
};

export const updateAddress = async (addstate: any) => {
    await $fetch('/api/auth/changeAddress', {
        method: 'PUT',
        body: { addstate },

    });
    await useAuth().updateSession();
};

export const updateDeliveryConfig = async (deliveryConfig: any) => {
    await $fetch('/api/auth/changeDeliveryConfig', {
        method: 'PUT',
        body: deliveryConfig,
    });
    await useAuth().updateSession();
};

export const updateLogo = async (logo: string) => {
    await $fetch('/api/auth/changeLogo', {
        method: 'PUT',
        body: { logo },
    });
    await useAuth().updateSession();
};

export const updateDeliveryType = async (deliveryType: string[]) => {
    await $fetch('/api/auth/changeDeliveryType', {
        method: 'PUT',
        body: { deliveryType },
    });
    await useAuth().updateSession();
};

export const updateIsAiImage = async (isAiImage: boolean) => {
    await $fetch('/api/auth/changeisaiimage', {
        method: 'PUT',
        body: { isAiImage },
    });
    await useAuth().updateSession();
};
