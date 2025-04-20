export const useAuth = () => useNuxtApp().$auth;
export const authLogin = async (email: string, password: string) => {
    const res = await $fetch('/api/auth/login', {
        method: 'POST',
        body: {
            email: email,
            password: password,
        },
    });
    await useAuth().updateSession();
    await navigateTo(
        useAuth().redirectTo.value ||
            '/dashboard',
    );
    return res;
};

export const authRegister = async (
    email: string,
    name: string,
    companyname: string,
    password: string,
    type: string,
) => {
    const res = await $fetch('/api/auth/register', {
        method: 'POST',
        body: {
            email,
            name,
            companyname,
            password,
            type,
        },
    });
    await authLogin(email, password);
    return res;
};

export const authForgetPassword = async (
    current_password: string,
    password: string
) => {
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
    await $fetch('/api/auth/logout', {
        method: 'POST',
    });
    await useAuth().updateSession();
    await navigateTo('/login');
};
export const checkEmailExist = async (email:string) => {
    const res = await $fetch('/api/auth/existinguser', {
        method: 'POST',
        body: {
            email: email
        },
    });
    return res
};

export const updateCompanySession = async (
    companyId: string | undefined,
    companyType: string | undefined,
    companyName: string | undefined,
    
) => {
    await $fetch('/api/auth/session', {
        method: 'PUT',
        body: {
            companyId,
            companyType,
            companyName,
        },
    });
    await useAuth().updateSession();
};

export const updateStoreUniqueName = async (
    storeUniqueName: string | undefined,
    
) => {
    await $fetch('/api/auth/changeStoreUniqueName', {
        method: 'PUT',
        body: {
            storeUniqueName
        },
    });
    await useAuth().updateSession();
};
