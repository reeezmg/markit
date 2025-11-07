<script setup lang="ts">
definePageMeta({
    layout: false,
});
import { z } from 'zod';
import type { FormError } from '#ui/types';
import { usePushNotifications } from '~/composables/usePushNotifications'
import { registerPush } from '~/composables/useCapPush'
import { Capacitor } from '@capacitor/core'
const reject = ref(true);
const route = useRoute();
const router = useRouter();
const loginLoading = ref(false)
const useAuth = () => useNuxtApp().$auth;
console.log(route.query.code)

const code = Array.isArray(route.query.code) ? route.query.code[0] : route.query.code;
watchEffect(() => {
   console.log(useAuth().session.value?.id);
});




const fields = [
    {
        name: 'email',
        type: 'text',
        label: 'Email',
        placeholder: 'Enter your email',
    },
    {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
    },
    //  {
    //   name: 'remember',
    //   label: 'Remember me',
    //   type: 'checkbox'
    // }
];

const formSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const validate = (state: any) => {
    try {
        const validatedData = formSchema.parse(state);
        return [];
    } catch (error) {
        if (error.errors) {
            const errors: FormError[] = error.errors.map((err: any) => ({
                path: err.path.join('.'),
                message: err.message,
            }));
            return errors;
        }
    }
};

async function onSubmit(data: any) {
    loginLoading.value = true
    try {
       const res = await authLogin(data.email.trim().toLowerCase(), data.password.trim());

        if (!Capacitor.isNativePlatform()) {
            usePushNotifications(useAuth().session.value?.id!)
        }else{
             registerPush(useAuth().session.value?.id!)
        }

       
    } catch (error) {
        reject.value = false;
        console.log(error);
    }
    finally{
        loginLoading.value = false
    }
}



</script>

<!-- eslint-disable vue/multiline-html-element-content-newline -->
<!-- eslint-disable vue/singleline-html-element-content-newline -->
<template>
    <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Markit">
        <template #right>
          <div class="flex items-center gap-4">
            <UButton color="primary"  to="/login">Login</UButton>
            <UButton color="primary" to="/register">Register</UButton>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
    <div class="flex justify-center items-center mt-10">
        <UCard class="max-w-sm w-full">
            <UAuthForm
                :fields="fields"
                :validate="validate"
                :loading="loginLoading"
                title="Welcome back!"
                icon="i-heroicons-lock-closed"
                :ui="{ base: 'text-center', footer: 'text-center' }"
                @submit="onSubmit"
            >
                <template #description>
                    Don't have an account?
                    <NuxtLink to="/register" class="text-primary font-medium"
                        >Register</NuxtLink
                    >.
                </template>

                <template #password-hint>
                    <NuxtLink to="/" class="text-primary font-medium"
                        >Forgot password?</NuxtLink
                    >
                </template>

                <template #validation v-if="!reject">
                    <UAlert
                        color="red"
                        icon="i-heroicons-information-circle-20-solid"
                        title="Error loging in"
                    />
                </template>

               
            </UAuthForm>
        </UCard>
    </div>
       </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
