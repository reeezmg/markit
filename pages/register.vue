<script setup lang="ts">
definePageMeta({ layout: false });

import { z } from 'zod';
import type { FormError } from '#ui/types';

const reject = ref(true);
const emailExist = ref(false);
const toast = useToast();

const fields = computed(() => [
  {
    name: 'email',
    type: 'text',
    label: 'Email',
    placeholder: 'Enter your email',
    onBlur: (event: Event) => checkEmail((event.target as HTMLInputElement).value),
  },
  ...(emailExist.value
    ? []
    : [
        {
          name: 'name',
          type: 'text',
          label: 'Your name',
          placeholder: 'Enter your name',
        },
        {
          name: 'password',
          type: 'password',
          label: 'Password',
          placeholder: 'Enter your password',
        },
        {
          name: 'confirmPassword',
          type: 'password',
          label: 'Confirm password',
          placeholder: 'Confirm your password',
        },
      ]),
  {
    name: 'companyname',
    type: 'text',
    label: 'Company name',
    placeholder: 'Enter your company name',
  },
  {
    name: 'agree',
    type: 'checkbox',
    label: 'I agree to the Terms and Conditions',
  },


//   {
//     name: 'type',
//     type: 'select',
//     label: 'Company type',
//     placeholder: 'Select company type',
//     optionAttribute: 'label', 
//     valueAttribute: 'value', 
//     options: [
//       { label: 'Buyer', value: 'buyer' },
//       { label: 'Seller', value: 'seller' },
//     ],
//   },
]);

const formSchema = z.object({
    email: z.string().email('Invalid email format'),
    name: z.string().min(1, 'Name is required'),
    companyname: z.string().min(1, 'Company name is required'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    confirmPassword: z.string(),
    agree: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the Terms and Conditions' }),
  }),
    // type: z.string().nonempty('Type is required'),
});


const validate = (state: any) => {
    try {
        const validated = formSchema.parse(state);
        if (validated.password !== validated.confirmPassword) {
            return [{ path: 'confirmPassword', message: 'Passwords do not match' }];
        }
        return [];
    } catch (error) {
        if (error.errors) {
            return error.errors.map((err: any) => ({
                path: err.path.join('.'),
                message: err.message,
            }));
        }
    }
};

async function onSubmit(data: any) {
    try {
        const res = await authRegister(
            data.email,
            data.name,
            data.companyname,
            data.password,
           'buyer',
        );
        // redirect or success message here
    } catch (error) {
        reject.value = false;
        console.error(error);
    }
}


const checkEmail = async (email: string) => {
    try {
        emailExist.value = await checkEmailExist(email);
        if(emailExist.value) {
          toast.add({
            title: 'your about to link a New Company To existing email!',
            id: 'modal-success',
            })
        }
        
       
    } catch (error) {
        console.error(error);
    }
};
</script>
<template>
    <div class="flex justify-center items-center mt-10">
      <UCard class="max-w-sm w-full">
        <UAuthForm
          :fields="fields"
          :validate="validate"
          title="Create a new Company!"
          icon="i-heroicons-user-plus"
          :ui="{ base: 'text-center', footer: 'text-center' }"
          @submit="onSubmit"
        >
          <template #description>
            Already have an account?
            <NuxtLink to="/login" class="text-primary font-medium">
              Login
            </NuxtLink>
          </template>

    
  
          <template #validation v-if="!reject">
            <UAlert
              color="red"
              icon="i-heroicons-information-circle-20-solid"
              title="Error registering"
            />
          </template>
  
          <template #footer>
            By signing up, you agree to our
            <NuxtLink to="/" class="text-primary font-medium">
              Terms of Service
            </NuxtLink>
          </template>
        </UAuthForm>
      </UCard>
    </div>
  </template>
  