<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { auth } from '~/composables/firebase'
import { 
  useFindUniqueClient, 
  useCreateClient, 
  useUpdateClient,
  useFindFirstCompany 
} from '~/lib/hooks'
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import { useToast } from '#imports'

const model = defineModel('model')
const phoneNo = defineModel('phoneNo')
const props = defineProps(['onVerify'])
const route = useRoute()
const toast = useToast()

// State
const issendotp = ref(false)
const isverifyotp = ref(false)
const showOtpInput = ref(false)
const alreadyLinked = ref(false)
const recaptchaVerifier = ref(null)

// Form data
const form = reactive({
  phone: '',
  otp: '',
  name: '',
  email: ''
})

// Hooks
const CreateClient = useCreateClient()
const UpdateClient = useUpdateClient()

const { data: company } = useFindFirstCompany({ 
  where: { name: route.params.company },
  select: { id: true } 
})

const args = computed(() => ({
  where: { phone: `+91${form.phone}` },
  include: {
    companies: {
      select: { companyId: true },
    },
  },
}))

const { data: client, refetch } = useFindUniqueClient(args, { enabled: false })

// Watchers
watch(phoneNo, (newPhoneNo) => {
  form.phone = newPhoneNo
})

watch([client, company], ([newClient, newCompany]) => {
  if (newClient && newCompany) {
    alreadyLinked.value = newClient.companies.some(
      (item) => newCompany.id === item.companyId
    )
  }
})

// Lifecycle
onMounted(() => {
  initializeRecaptcha()
})

// Methods
const initializeRecaptcha = () => {
  if (!recaptchaVerifier.value && typeof window !== 'undefined') {
    try {
      recaptchaVerifier.value = new RecaptchaVerifier('recaptcha-container', {
        size: 'invisible',
        callback: (response) => {
          console.log('Recaptcha solved:', response)
        },
        'expired-callback': () => {
          console.log('Recaptcha expired.')
        }
      }, auth)
    } catch (error) {
      console.error('Recaptcha initialization error:', error)
    }
  }
}

const login = async () => {
  try {
    if (!client.value && form.name) {
      await CreateClient.mutateAsync({
        data: {
          name: form.name,
          phone: `+91${form.phone}`,
          ...(form.email && { email: form.email })
        }
      })
    }

    if (client.value && !alreadyLinked.value && company.value) {
      await UpdateClient.mutateAsync({
        where: { id: client.value.id },
        data: {
          companies: {
            create: {
              company: {
                connect: { id: company.value.id },
              }
            }
          },
        },
      })
    }
  } catch (err) {
    console.error('Login error:', err)
    toast.add({
      title: 'Error',
      description: 'Failed to process your request',
      color: 'red',
    })
  }
}

const sendOtp = async () => {
  issendotp.value = true
  
  if (!form.phone) {
    toast.add({
      title: 'Missing phone number',
      description: 'Please enter your phone number.',
      color: 'red',
    })
    issendotp.value = false
    return
  }

  try {
    await initializeRecaptcha()
    
    const confirmation = await signInWithPhoneNumber(
      auth, 
      `+91${form.phone}`, 
      recaptchaVerifier.value
    )
    
    window.confirmationResult = confirmation
    await refetch()

    toast.add({
      title: 'OTP sent successfully!',
      id: 'otp-success',
      color: 'green',
    })
    
    showOtpInput.value = true
  } catch (error) {
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
      default:
        break
    }
    
    toast.add({
      title: 'Failed to send OTP',
      description: message,
      color: 'red',
    })
  } finally {
    issendotp.value = false
  }
}

const verifyOtp = async () => {
  isverifyotp.value = true
  
  if (!form.otp) {
    toast.add({
      title: 'Missing OTP',
      description: 'Please enter the OTP.',
      color: 'red',
    })
    isverifyotp.value = false
    return
  }

  try {
    await window.confirmationResult.confirm(form.otp)
    await login()
    
    toast.add({
      title: 'Client added successfully',
      id: 'login-success',
      color: 'green',
    })
    
    props.onVerify?.()
    model.value = false
    showOtpInput.value = false
  } catch (error) {
    console.error('OTP verification failed:', error)
    
    let message = 'Something went wrong during OTP verification.'
    switch (error.code) {
      case 'auth/invalid-verification-code':
        message = 'The OTP entered is incorrect. Please try again.'
        break
      case 'auth/code-expired':
        message = 'The OTP has expired. Please request a new one.'
        break
      default:
        break
    }
    
    toast.add({
      title: 'OTP verification failed',
      description: message,
      color: 'red',
    })
  } finally {
    isverifyotp.value = false
  }
}
</script>

<template>
  <UModal v-model="model">
    <UCard
      :ui="{
        base: 'h-full flex flex-col',
        rounded: '',
        divide: 'divide-y divide-gray-100 dark:divide-gray-800',
        body: {
          base: 'grow'
        }
      }"
    >
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ showOtpInput ? 'Verify OTP' : 'Phone Verification' }}
        </h2>
      </template>

      <div class="space-y-4 w-full">
        <!-- Phone Input Form -->
        <UForm
          v-if="!showOtpInput"
          :state="form"
          @submit.prevent="sendOtp"
          class="space-y-4"
        >
          <UFormGroup label="Phone Number" name="phone" required>
            <UInput
              v-model="phoneNo"
              type="tel"
              placeholder="Enter your phone number"
              size="lg"
            >
              <template #leading>+91</template>
            </UInput>
          </UFormGroup>

          <div id="recaptcha-container" class="my-4" style="display: none;" />

          <UButton
            type="submit"
            block
            size="lg"
            :loading="issendotp"
            :disabled="!form.phone"
          >
            Send OTP
          </UButton>
        </UForm>

        <!-- OTP Verification Form -->
        <UForm
          v-if="showOtpInput"
          @submit.prevent="verifyOtp"
          class="space-y-4"
        >
          <UFormGroup 
            v-if="!client" 
            label="Full Name" 
            name="name"
            required
          >
            <UInput
              v-model="form.name"
              type="text"
              placeholder="Enter your name"
              size="lg"
            />
          </UFormGroup>

          <UFormGroup 
            v-if="!client" 
            label="Email" 
            name="email"
            hint="Optional"
          >
            <UInput
              v-model="form.email"
              type="email"
              placeholder="Enter your email"
              size="lg"
            />
          </UFormGroup>

          <UFormGroup label="OTP" name="otp" required>
            <UInput
              v-model="form.otp"
              type="text"
              placeholder="Enter the 6-digit OTP"
              size="lg"
            />
          </UFormGroup>

          <UButton
            type="submit"
            block
            size="lg"
            :loading="isverifyotp"
            :disabled="!form.otp || (!client && !form.name)"
          >
            Verify OTP
          </UButton>
        </UForm>
      </div>

      <template #footer>
        <div class="text-center text-sm text-gray-500 dark:text-gray-400">
          {{
            showOtpInput 
              ? 'Enter the OTP sent to your phone' 
              : 'We will send you a verification code'
          }}
        </div>
      </template>
    </UCard>
  </UModal>
</template>