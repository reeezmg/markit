export const useAuth = () => useNuxtApp().$auth;

export const authLogin = async (email: string, password: string) => {
    const config = useRuntimeConfig();
    
    const res = await $fetch('/api/auth/login', {
        method: 'POST',
        body: { email, password },

    });
    await useAuth().updateSession();
    await navigateTo(useAuth().redirectTo.value || '/dashboard');
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
    companyId: string | undefined,
    companyType: string | undefined,
    companyName: string | undefined,
    name: string | undefined,
    role: string | undefined,
    code: string | undefined,
    billCounter: number | undefined,
    plan: number | undefined,
    description: string | undefined,
    storeUniqueName: string | undefined
) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/session', {
        method: 'PUT',
        body: { companyId, companyType, companyName, name, role, code, billCounter, plan, description, storeUniqueName },

    });
    await useAuth().updateSession();
};

export const updateStoreUniqueName = async (storeUniqueName: string) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/changeStoreUniqueName', {
        method: 'PUT',
        body: { storeUniqueName },

    });
    await useAuth().updateSession();
};

export const updateIsTaxIncluded = async (isTaxIncluded: boolean) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/changeIncludeTax', {
        method: 'PUT',
        body: { isTaxIncluded },

    });
    await useAuth().updateSession();
};

export const updateIsBarcodeIncluded = async (isBarcodeIncluded: boolean) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/changeIncludeBarcode', {
        method: 'PUT',
        body: { isBarcodeIncluded },

    });
    await useAuth().updateSession();
};

export const updateIsUserTrackIncluded = async (isUserTrackIncluded: boolean) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/changeIncludeUserTrack', {
        method: 'PUT',
        body: { isUserTrackIncluded },

    });
    await useAuth().updateSession();
};

export const updateSession = async (productinputData: any, variantinputData: any) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/changeInputs', {
        method: 'PUT',
        body: { productinputData, variantinputData },

    });
    await useAuth().updateSession();
    console.log('Session updated');
};

export const updateProfileDetails = async (name: string | null, email: string | null, image: string | null) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/changeprofiledetails', {
        method: 'PUT',
        body: { name, email, image },

    });
    await useAuth().updateSession();
    console.log('Session updated');
};

export const updatePointsValue = async (pointsValue: number) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/changePointsValue', {
        method: 'PUT',
        body: { pointsValue },

    });
    await useAuth().updateSession();
};
