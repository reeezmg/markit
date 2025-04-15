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
            `/${useAuth().session.value?.companyId}`,
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

export const authLogout = async () => {
    await $fetch('/api/auth/logout', {
        method: 'POST',
    });
    await useAuth().updateSession();
    await navigateTo('/login');
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
