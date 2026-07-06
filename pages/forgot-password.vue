<script setup lang="ts">
import { z } from 'zod';

definePageMeta({ layout: false });

const toast = useToast();
const otpSent = ref(false);
const isSendingOtp = ref(false);
const isResettingPassword = ref(false);
const resetError = ref('');

const state = reactive({
    email: '',
    otp: '',
    password: '',
    confirmPassword: '',
});

const emailSchema = z.string().email('Invalid email format');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters long');

const requestOtp = async () => {
    resetError.value = '';
    const email = state.email.trim().toLowerCase();
    const emailResult = emailSchema.safeParse(email);

    if (!emailResult.success) {
        resetError.value = emailResult.error.errors[0]?.message || 'Enter a valid email';
        return;
    }

    state.email = email;
    isSendingOtp.value = true;

    try {
        const exists = await $fetch('/api/auth/existinguser', {
            method: 'POST',
            body: { email },
        });

        if (!exists) {
            throw new Error('Email not found! Please register.');
        }

        const res = await $fetch('/api/send-otp', {
            method: 'POST',
            body: { email },
        });

        otpSent.value = true;
        toast.add({
            title: res.message,
            icon: 'i-heroicons-check-circle',
            color: 'green',
        });
    } catch (error: any) {
        resetError.value = error?.data?.message || error?.data?.statusMessage || error?.message || 'Failed to send OTP';
    } finally {
        isSendingOtp.value = false;
    }
};

const resetPassword = async () => {
    resetError.value = '';
    const passwordResult = passwordSchema.safeParse(state.password);

    if (!state.otp.trim()) {
        resetError.value = 'Please enter the OTP';
        return;
    }

    if (!passwordResult.success) {
        resetError.value = passwordResult.error.errors[0]?.message || 'Enter a valid password';
        return;
    }

    if (state.password !== state.confirmPassword) {
        resetError.value = 'Passwords do not match';
        return;
    }

    isResettingPassword.value = true;

    try {
        const res = await $fetch('/api/auth/resetPassword', {
            method: 'POST',
            body: {
                email: state.email,
                otp: state.otp.trim(),
                password: state.password,
            },
        });

        toast.add({
            title: res.message,
            icon: 'i-heroicons-check-circle',
            color: 'green',
        });
        await navigateTo('/login');
    } catch (error: any) {
        resetError.value = error?.data?.message || error?.data?.statusMessage || error?.message || 'Error resetting password';
    } finally {
        isResettingPassword.value = false;
    }
};
</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar title="Markit">
                <template #right>
                    <div class="flex items-center gap-4">
                        <UButton color="primary" to="/login">Login</UButton>
                        <UButton color="primary" to="/register">Register</UButton>
                    </div>
                </template>
            </UDashboardNavbar>

            <UDashboardPanelContent>
                <div class="flex justify-center items-center mt-10">
                    <UCard class="max-w-sm w-full">
                        <form class="space-y-4" @submit.prevent="otpSent ? resetPassword() : requestOtp()">
                            <div class="text-center space-y-1">
                                <h2 class="text-xl font-semibold">Reset password</h2>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    Enter your email and verify the OTP to set a new password.
                                </p>
                            </div>

                            <UFormGroup name="email" label="Email">
                                <UInput
                                    v-model="state.email"
                                    type="email"
                                    placeholder="Enter your account email"
                                    :disabled="otpSent"
                                />
                            </UFormGroup>

                            <template v-if="otpSent">
                                <UFormGroup name="otp" label="OTP">
                                    <UInput
                                        v-model="state.otp"
                                        type="text"
                                        placeholder="Enter OTP"
                                    />
                                </UFormGroup>

                                <UFormGroup name="password" label="New password">
                                    <UInput
                                        v-model="state.password"
                                        type="password"
                                        placeholder="Enter new password"
                                    />
                                </UFormGroup>

                                <UFormGroup name="confirmPassword" label="Confirm password">
                                    <UInput
                                        v-model="state.confirmPassword"
                                        type="password"
                                        placeholder="Confirm new password"
                                    />
                                </UFormGroup>
                            </template>

                            <UAlert
                                v-if="resetError"
                                color="red"
                                icon="i-heroicons-information-circle-20-solid"
                                :title="resetError"
                            />

                            <UButton
                                type="submit"
                                block
                                color="primary"
                                :loading="otpSent ? isResettingPassword : isSendingOtp"
                            >
                                {{ otpSent ? 'Reset Password' : 'Send OTP' }}
                            </UButton>

                            <div class="text-center text-sm">
                                Remembered it?
                                <NuxtLink to="/login" class="text-primary font-medium">Login</NuxtLink>
                            </div>
                        </form>
                    </UCard>
                </div>
            </UDashboardPanelContent>
        </UDashboardPanel>
    </UDashboardPage>
</template>
