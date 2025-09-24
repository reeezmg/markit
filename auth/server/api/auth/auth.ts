export const useAuth = () => useNuxtApp().$auth;

export const authLogin = async (email: string, password: string) => {
    const config = useRuntimeConfig();
    
    const res = await $fetch('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        credentials: 'include',
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
    companyLogo: string | undefined,
    name: string | undefined,
    role: string | undefined,
    code: string | undefined,
    plan: number | undefined,
    description: string | undefined,
    storeUniqueName: string | undefined
) => {
    const config = useRuntimeConfig();
    await $fetch('/api/auth/session', {
        method: 'PUT',
        body: { companyId, companyType, companyName, companyLogo, name, role, code, plan, description, storeUniqueName },

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
export const updateStorePhone = async (storePhone: string) => {
    await $fetch('/api/auth/changeStorePhone', {
        method: 'PUT',
        body: { storePhone },

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
    const config = useRuntimeConfig();
    await $fetch('/api/auth/changeIncludeTax', {
        method: 'PUT',
        body: { isTaxIncluded },

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
