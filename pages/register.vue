<script setup lang="ts">
definePageMeta({
    layout: false,
});
import { z } from 'zod';
import type { FormError } from '#ui/types';
const reject = ref(true);
const fields = [
    {
        name: 'email',
        type: 'text',
        label: 'Email',
        placeholder: 'Enter your email',
    },
    {
        name: 'name',
        label: 'Your name',
        type: 'text',
        placeholder: 'Enter your name',
    },
    {
        name: 'companyname',
        label: 'Company name',
        type: 'text',
        placeholder: 'Enter your company name',
    },
    {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
    },
    {
        name: 'confirmPassword',
        label: 'Confirm password',
        type: 'password',
        placeholder: 'Enter your password',
    },
];

const formSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    confirmPassword: z.string(),
});

const validate = (state: any) => {
    try {
        const validatedData = formSchema.parse(state);
        if (validatedData.password !== validatedData.confirmPassword) {
            throw new Error('Passwords do not match');
        }
        return [];
    } catch (error) {
        if (error.errors) {
            const errors: FormError[] = error.errors.map((err: any) => ({
                path: err.path.join('.'),
                message: err.message,
            }));
            return errors;
        }

        if (error.message === 'Passwords do not match') {
            const errors: FormError[] = [
                { path: 'confirmPassword', message: 'Passwords do not match' },
            ];
            return errors;
        }
    }
};

const options = [
    { label: 'Buyer', value: 'buyer' },
    { label: 'Seller', value: 'seller' },
];

const formData = reactive({
    email: '',
    name: '',
    companyname: '',
    password: '',
    confirmPassword: '',
    type: '',
});

async function onSubmit() {
    console.log('Submitted', formData.type.value);
    try {
        const res = await authRegister(
            formData.email,
            formData.name,
            formData.companyname,
            formData.password,
            formData.type.value,
        );
    } catch (error) {
        reject.value = false;
        console.log(error);
    }
}
</script>

<!-- eslint-disable vue/multiline-html-element-content-newline -->
<!-- eslint-disable vue/singleline-html-element-content-newline -->
<template>
    <div class="flex justify-center items-center mt-10">
        <UCard class="max-w-sm w-full text-center">
            <div class="mb-3 text-2xl font-bold">Create a new Company!</div>
            <div class="mb-3">
                Don't have an account?
                <NuxtLink to="/login" class="text-primary font-medium">
                    Log in
                </NuxtLink>
            </div>

            <div v-for="field in fields" :key="field.name" class="mb-3">
                <UFormGroup :name="field.name" :label="field.label">
                    <UInput
                        v-model="formData[field.name]"
                        :type="field.type"
                        :placeholder="field.placeholder"
                    />
                </UFormGroup>
            </div>

            <UFormGroup name="selectMenu" label="Type" class="mb-3">
                <USelectMenu
                    v-model="formData.type"
                    placeholder="Select company type"
                    :options="options"
                />
            </UFormGroup>

            <UButton type="submit" block class="mb-3" @click="onSubmit">
                Continue
            </UButton>

            <div>
                By signing in, you agree to our
                <NuxtLink to="/" class="text-primary font-medium">
                    Terms of Service
                </NuxtLink>
            </div>
        </UCard>
    </div>
</template>
