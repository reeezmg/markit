<script setup lang="ts">
definePageMeta({ layout: false });

import { z } from 'zod';
import { reactive, ref } from 'vue';

const reject = ref(true);
const emailExist = ref(false);
const isEmailVerified = ref(false);
const toast = useToast();
const isSendingOtp = ref(false);
const isVerifyingOtp = ref(false);
const showOtpInput = ref(false)
const registerLoading = ref(false)

const route = useRoute()

// Form state
const state = reactive({
  email: '',
  name: '',
  password: '',
  confirmPassword: '',
  companyname: '',
  agree: false,
  plan: ''
});

const plans = ['free','lite','pro']

onMounted(() => {
    state.plan = route.query.plan as string
})

const otp = ref('');

// Zod schema
const formSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  confirmPassword: z.string(),
  companyname: z.string().min(1, 'Company name is required'),
  agree: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the Terms and Conditions' }),
  }),
});

// Validate function
const validate = (state: any) => {
  try {
    if(!emailExist){
    const validated = formSchema.parse(state);
    if (validated.password !== validated.confirmPassword) {
      return [{ path: 'confirmPassword', message: 'Passwords do not match' }];
    }
    return [];
  }
  return []
  } catch (error: any) {
    if (error.errors) {
      return error.errors.map((err: any) => ({
        path: err.path.join('.'),
        message: err.message,
      }));
    }
    return [];
  }
};

// Form submission
async function onSubmit() {
  registerLoading.value = true
  try {
    const res = await authRegister(
      state.email.trim().toLowerCase(),
      state.name,
      state.companyname,
      state.password.trim(),
      state.plan,
      'buyer'
    );
    console.log(res);
    // Success logic here
  } catch (error) {
    reject.value = false;
    console.error(error);
  }
}

// Email check logic
const checkEmail = async (email: string) => {
  try {
    emailExist.value = await checkEmailExist(email);
    if (emailExist.value) {
      toast.add({
        title: 'You’re about to link a new company to an existing email!',
        id: 'modal-success',
      });
    }
  } catch (error) {
    console.error(error);
  } finally{
     registerLoading.value = false
  }
};


const onVerifyEmail = async () => {
   
    const { email } = state;
    if (!email) {
        toast.add({ title: 'Please enter your email', icon: 'i-heroicons-exclamation-circle', color: 'red' });
        return;
    }

    isSendingOtp.value = true;
    checkEmail(state.email);
    try {
        const res = await $fetch('/api/send-otp', {
            method: 'POST',
            body: { email },
        });

        toast.add({ title: res.message, icon: 'i-heroicons-check-circle', color: 'green' });
        showOtpInput.value = true;
    } catch (error: any) {
        console.error(error);
        toast.add({ title: 'Failed to send OTP', icon: 'i-heroicons-exclamation-circle', color: 'red' });
    }finally {
        isSendingOtp.value = false;
    }
};

const onVerifyOtp = async () => {
    if (!otp.value) {
        toast.add({ title: 'Please enter the OTP', icon: 'i-heroicons-exclamation-circle', color: 'red' });
        return;
    }
    isVerifyingOtp.value = true;

    try {
        const res = await $fetch('/api/verify-otp', {
            method: 'POST',
            body: {
                email: state.email,
                otp: otp.value,
            },
        });

        toast.add({ title: res.message, icon: 'i-heroicons-check-circle', color: 'green' });
       
        showOtpInput.value = false;
        isEmailVerified.value = true;
        otp.value = '';
    } catch (error: any) {
        console.error(error);
        toast.add({ title: 'OTP verification failed', icon: 'i-heroicons-exclamation-circle', color: 'red' });
    }finally {
        isVerifyingOtp.value = false;
    }
};


</script>

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
      <UForm :state="state" :validate="validate" @submit="onSubmit" class="space-y-4">
        <h2 class="text-xl font-semibold text-center">Create a new Company!</h2>

        <UFormGroup name="email" label="Email">
          <UInput
            v-model="state.email"
            type="text"
            placeholder="Enter your email"
          />
          <UInput
           v-if="showOtpInput"
           class="mt-3"
            v-model="otp"
            type="text"
            placeholder="Enter OTP"
          />
        
          <UButton
           v-if="showOtpInput"
            label="Verify OTP"
            size="md"
            :loading="isVerifyingOtp"
            class="mt-2"
            @click="onVerifyOtp"
            />
            <UButton
              v-if="!showOtpInput && !isEmailVerified"
              label="Verify Email"
              size="md"
              class="mt-4"
              :loading="isSendingOtp"
              @click="onVerifyEmail"
                />
        </UFormGroup>

        <template v-if="isEmailVerified">
          <UFormGroup name="name" label="Your Name">
            <UInput v-model="state.name" placeholder="Enter your name" />
          </UFormGroup>

          <UFormGroup name="password" label="Password">
            <UInput
              v-model="state.password"
              type="password"
              placeholder="Enter your password"
            />
          </UFormGroup>

          <UFormGroup v-if="!emailExist" name="confirmPassword" label="Confirm Password">
            <UInput
              v-model="state.confirmPassword"
              type="password"
              placeholder="Confirm your password"
            />
          </UFormGroup>
        </template>

        <UFormGroup v-if="isEmailVerified" name="companyname" label="Company Name">
          <UInput v-model="state.companyname" placeholder="Enter your company name" />
        </UFormGroup>

        <UFormGroup v-if="isEmailVerified" name="plan" label="Plan">
           <USelectMenu v-model="state.plan" :options="plans" />
        </UFormGroup>

        <UFormGroup v-if="isEmailVerified" name="agree">
          <UCheckbox
            v-model="state.agree"
            label="I agree to the Terms and Conditions"
          />
        </UFormGroup>

        <UButton v-if="isEmailVerified" :loading="registerLoading" type="submit" block color="primary">
          Register Company
        </UButton>

        <div class="text-center text-sm">
          Already have an account?
          <NuxtLink to="/login" class="text-primary font-medium">Login</NuxtLink>
        </div>

        <div class="text-center text-sm mt-2">
          By signing up, you agree to our
          <NuxtLink to="/" class="text-primary font-medium">Terms of Service</NuxtLink>
        </div>

        <template v-if="!reject">
          <UAlert
            color="red"
            icon="i-heroicons-information-circle-20-solid"
            title="Error registering"
          />
        </template>
      </UForm>
    </UCard>
  </div>
     </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
