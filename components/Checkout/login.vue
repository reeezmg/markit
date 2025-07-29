
   <script setup lang="ts">
import { reactive, ref, computed, watch, onMounted, type Ref } from 'vue'
import { auth } from '~/composables/firebase'
import { useFindUniqueClient, useCreateClient, useUpdateClient, useFindFirstCompany, useFindFirstCartCompanyClient, useCreateCartCompanyClient, useFindFirstLikeCompanyClient, useCreateLikeCompanyClient } from '~/lib/hooks'
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth'
import { getCountryCallingCode } from 'libphonenumber-js'
import { useNuxtApp, useRoute } from 'nuxt/app'




interface ClientForm {
  phone: string
  otp: string
  name: string
  email: string
}

// Define auth client type
interface AuthClient {
  loggedIn: Ref<boolean>
  session: Ref<any>
  updateSession: (opts?: any) => Promise<void>
  login: (phone: string) => Promise<any>
}

const authClient = useNuxtApp().$authClient as AuthClient
const route = useRoute()
const toast = useToast()
const CreateClient = useCreateClient()
const UpdateClient = useUpdateClient()
const CreateCart = useCreateCartCompanyClient()
const CreateLike = useCreateLikeCompanyClient()
// const findCart = useFindFirstCartCompanyClient()
const emit = defineEmits(['close'])

const form = reactive<ClientForm>({
  phone: '',
  otp: '',
  name: '',
  email: ''
})

const alreadyLinked = ref<boolean>()
const showOtpInput = ref(false)
const isResendVisible = ref(false)
const recaptchaVerifier = ref<RecaptchaVerifier | null>(null)
const resendCooldown = ref(0)
const resendTimer = ref<NodeJS.Timeout | null>(null)
const cartStore = useCartStore();
const likeStore = useLikeStore();

onMounted(async () => {
  try {
    const res = await fetch('https://ipapi.co/json/')
    const data = await res.json()
    const countryCode = data.country || 'IN'
    const dialCode = '+' + getCountryCallingCode(countryCode)
    form.phone = dialCode
  } catch {
    form.phone = '+91'
  }
})






const { data: company } = useFindFirstCompany({ 
  where: { name: route.params.company as string }, 
  select: { id: true } 
})

const args = computed(() => ({
  where: { phone: form.phone },
  include: {
    companies: {
      select: { companyId: true },
    },
  },
}))

const { data: client, refetch } = useFindUniqueClient(args, { enabled: false })

watch([client, company], ([newClient, newCompany]) => {
  if (newClient && newCompany) {
    alreadyLinked.value = newClient.companies.some(
      (item) => newCompany.id === item.companyId
    )
  }
})

const findCart = useFindFirstCartCompanyClient({
  where: { 
    companyId: company.value?.id,
    clientId: client.value?.id 
  },
  include: { cart: true }
});

const findlike = useFindFirstLikeCompanyClient({
  where: { 
    companyId: company.value?.id,
    clientId: client.value?.id 
  },
  include: { like: true }
});


const login = async () => {
  // Create client if needed
  if (!client.value && form.name) {
    try {
      await CreateClient.mutateAsync({
        data: {
          name: form.name,
          phone: form.phone,
          ...(form.email && { email: form.email })
        }
      });
      await refetch(); // Refresh client data
    } catch (err) {
      console.error(err);
      toast.add({
        title: 'Error creating client',
        description: 'Failed to create client account',
        color: 'red',
      });
      return;
    }
  }

  // Link to company if needed
  if (client.value && !alreadyLinked.value && company.value) {
    try {
      await UpdateClient.mutateAsync({
        where: { id: client.value.id },
        data: {
          companies: {
            create: {
              company: {
                connect: { id: company.value.id },
              }
            },
          },
        },
      });
    } catch (err) {
      console.error(err);
      toast.add({
        title: 'Error updating client',
        description: 'Failed to link client to company',
        color: 'red',
      });
    }
  }

  try {
    // Authenticate
    await authClientLogin(form.phone);
    
    // Ensure we have both client and company
    if (client.value?.id && company.value?.id) {
      // Check for existing cart
      const { data: existingCart } = await findCart.refetch();
      const { data: existingLike } = await findlike.refetch();
      
      if (!existingCart) {
        // Create new cart if none exists
        await CreateCart.mutateAsync({
          data: {
            client: { connect: { id: client.value.id } },
            company: { connect: { id: company.value.id } },
            cart: { create: { items: [] } }
          }
        });
      } else {if(!existingLike){
          await CreateLike.mutateAsync({
          data: {
            client: { connect: { id: client.value.id } },
            company: { connect: { id: company.value.id } },
            like: { create: {  } }
          }
        });
      }}
      
try {
  // Merge likes first
  await likeStore._mergeWithServerLikes(client.value.id, company.value?.id);
  
  // Then merge cart
  await cartStore._mergeWithServerCart(client.value.id, company.value?.id);
  
  toast.add({
    title: 'Sync successful',
    description: 'Your likes and cart have been synced with the server',
    color: 'green',
    icon: 'i-heroicons-check-circle',
  });
} catch (error) {
  console.error('Sync failed:', error);
  
  toast.add({
    title: 'Sync error',
    description: 'Failed to sync your data with the server',
    color: 'red',
    icon: 'i-heroicons-exclamation-triangle',
  });
  
  // Optionally add more specific error handling
  if (error instanceof Error) {
    toast.add({
      title: 'Error details',
      description: error.message,
      color: 'orange',
      icon: 'i-heroicons-information-circle',
      timeout: 5000,
    });
  }
}
    }
    
    emit('close');
    toast.add({
      title: 'Login successful',
      id: 'login-success',
      color: 'green',
    });
  } catch (err) {
    console.error(err);
    toast.add({
      title: 'Login failed',
      description: 'Failed to authenticate',
      color: 'red',
    });
  }
};

const setupRecaptcha = () => {
  if (!recaptchaVerifier.value) {
    recaptchaVerifier.value = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: (response: string) => {
        console.log('Recaptcha solved:', response)
      },
      'expired-callback': () => {
        console.log('Recaptcha expired.')
      }
    })
    recaptchaVerifier.value.render()
  }
}

const sendOtp = async () => {
  if (!form.phone) {
    toast.add({
      title: 'Phone number required',
      description: 'Please enter your phone number.',
      color: 'red',
    })
    return
  }

  setupRecaptcha()

  try {
    if (!recaptchaVerifier.value) throw new Error('Recaptcha not initialized')
    
    const confirmation = await signInWithPhoneNumber(auth, form.phone, recaptchaVerifier.value)
    ;(window as any).confirmationResult = confirmation
    await refetch()

    toast.add({
      title: 'OTP sent successfully!',
      id: 'otp-success',
      color: 'green',
    })
    isResendVisible.value = true

    showOtpInput.value = true
    startResendTimer()
  } catch (error: any) {
    console.error('Error sending OTP:', error)
    let message = 'Something went wrong while sending the OTP.'
    switch (error.code) {
      case 'auth/invalid-phone-number':
        message = 'The phone number entered is invalid.'
        break
      case 'auth/missing-phone-number':
        message = 'Please enter a valid phone number.'
        break
      case 'auth/too-many-requests':
        message = 'Too many attempts. Please try again later.'
        break
    }
    toast.add({
      title: 'Failed to send OTP',
      description: message,
      color: 'red',
    })
  }
}

const verifyOtp = async () => {
  if (!form.otp) {
    toast.add({
      title: 'Missing OTP',
      description: 'Please enter the OTP.',
      color: 'red',
    })
    return
  }

  try {
    const confirmationResult = (window as any).confirmationResult as ConfirmationResult
    if (!confirmationResult) throw new Error('Confirmation result not found')
    
    const result = await confirmationResult.confirm(form.otp)
    console.log('Phone number verified!', result.user)
    await login()
    emit('close')

    toast.add({
      title: 'Login successful',
      id: 'login-success',
      color: 'green',
    })
  } catch (error: any) {
    console.error('OTP verification failed:', error)
    let message = 'Something went wrong during OTP verification.'
    switch (error.code) {
      case 'auth/invalid-verification-code':
        message = 'The OTP entered is incorrect. Please try again.'
        break
      case 'auth/code-expired':
        message = 'The OTP has expired. Please request a new one.'
        break
    }
    toast.add({
      title: 'OTP verification failed',
      description: message,
      color: 'red',
    })
  }
}

const startResendTimer = () => {
  resendCooldown.value = 30
  resendTimer.value = setInterval(() => {
    resendCooldown.value--
    if (resendCooldown.value <= 0 && resendTimer.value) {
      clearInterval(resendTimer.value)
      resendCooldown.value = 0
      resendTimer.value = null
    }
  }, 1000)
}


</script>

<template>
  <UForm 
    :state="form" 
    @submit.prevent="!showOtpInput ? sendOtp() : verifyOtp()" 
    class="space-y-4 flex flex-col items-center justify-center w-full"
  >
    <div v-if="!showOtpInput" class="w-full max-w-md">
      <UFormGroup label="Phone Number" name="phone" class="w-full">
        <UInput v-model="form.phone" type="tel" placeholder="Enter your phone number with country code" class="w-full" />
      </UFormGroup>
      <div id="recaptcha-container" class="my-4" />
      <div class="text-end w-full">
        <UButton type="submit">
          {{ showOtpInput ? 'Verify OTP' : 'Send OTP' }}
      </UButton>

        <UButton v-if="isResendVisible"
          type="submit"
          variant="outline"
          :disabled="resendCooldown > 0 "
          @click="sendOtp"
         
        >
          {{ resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP' }}
        </UButton>
      </div>
    </div>

    <div v-if="showOtpInput" class="w-full">
      <UFormGroup v-if="!client" label="Enter Name" name="name">
        <UInput v-model="form.name" type="text" placeholder="Enter your name" class="w-full mb-3" />
      </UFormGroup>

      <UFormGroup v-if="!client" label="Enter Email" name="email" hint="Optional">
        <UInput v-model="form.email" type="email" placeholder="Enter your email" class="w-full mb-3" />
      </UFormGroup>

      <UFormGroup label="Enter OTP" name="otp">
        <UInput v-model="form.otp" type="text" placeholder="Enter the OTP" class="w-full mb-3" />
      </UFormGroup>

      <div class="text-end w-full mt-4">
        <UButton type="submit">Verify OTP</UButton>
      </div>
    </div>
  </UForm>
</template>