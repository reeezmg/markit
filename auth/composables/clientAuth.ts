export const useClientAuth = () => useNuxtApp().$authClient;

export const authClientLogin = async ( phone: string) => {
    await authClientLogout()
    const res = await $fetch('/api/clientauth/login', {
        method: 'POST',
        body: {
            phone: phone,
        },
    });
    
    await useClientAuth().updateSession();
    return res;
};

export const authClientRegister = async (
    email: string,
    name: string,
    password: string,
    phone: string,
    companyId: string,
) => {
    const res = await $fetch('/api/clientauth/register', {
        method: 'POST',
        body: {
            email,
            name,
            password,
            phone,
            companyId
        },
    });
    await authClientLogin(phone);
    return res;
};

export const authClientLogout = async () => {
    await $fetch('/api/clientauth/logout', {
        method: 'POST',
    });
    await useClientAuth().updateSession();
};
