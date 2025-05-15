<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from '#imports'

import { auth } from '~/composables/firebase'
import {
  useFindUniqueClient,
  useCreateClient,
  useUpdateClient,
  useFindFirstCompany,
} from '~/lib/hooks'
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'

const model = defineModel('model')
const phoneNo = defineModel('phoneNo')
const props = defineProps(['onVerify'])

const issendotp = ref(false)
const isverifyotp = ref(false)
const showOtpInput = ref(false)
const alreadyLinked = ref(false)
const recaptchaReady = ref(false)
let recaptchaVerifier = null

const form = reactive({
  phone: '',
  otp: '',
  name: '',
  email: '',
})

const route = useRoute()
const toast = useToast()

const CreateClient = useCreateClient()
const UpdateClient = useUpdateClient()

const { data: company } = useFindFirstCompany({
  where: { name: route.params.company },
  select: { id: true },
})

const args = computed(() => ({
  where: { phone: `+91${form.phone}` },
  include: {
    companies: {
      select: { companyId: true },
    },
  },
}))

const {
  data: client,
  isLoading,
  error,
  refetch,
} = useFindUniqueClient(args, { enabled: false })

watch(phoneNo, (newphoneNo) => {
  form.phone = newphoneNo
})

watch([client, company], ([newClient, newCompany]) => {
  if (newClient && newCompany) {
    alreadyLinked.value = newClient.companies.some(
      (item) => newCompany.id === item.companyId
    )
  }
})

onMounted(() => {
  if (process.client) {
    setTimeout(() => {
      // Delay to ensure DOM element is present
      const el = document.getElementById('recaptcha-container')
      if (el && !recaptchaVerifier) {
        recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: (response) => {
            console.log('Recaptcha solved:', response)
          },
          'expired-callback': () => {
            console.log('Recaptcha expired.')
          },
        })
        recaptchaVerifier.render().then(() => {
          recaptchaReady.value = true
        })
      }
    }, 300)
  }
})

const login = async () => {
  if (!client.value && form.name) {
    try {
      const res = await CreateClient.mutateAsync({
        data: {
          name: form.name,
          phone: `+91${form.phone}`,
          ...(form.email && { email: form.email }),
        },
      })
    } catch (err) {
      console.error(err)
    }
  }

  if (client.value && !alreadyLinked.value) {
    try {
      await UpdateClient.mutateAsync({
        where: { id: client.value.id },
        data: {
          companies: {
            create: {
              company: {
                connect: { id: company.value.id },
              },
            },
          },
        },
      })
    } catch (err) {
      console.error(err)
    }
  }
}

const sendOtp = async () => {
  issendotp.value = true
  if (!form.phone) {
    alert('Please enter your phone number.')
    issendotp.value = false
    return
  }

  try {
    if (!recaptchaVerifier) {
      toast.add({
        title: 'Error',
        description: 'reCAPTCHA not ready. Please refresh the page.',
        color: 'red',
      })
      issendotp.value = false
      return
    }

    const confirmation = await signInWithPhoneNumber(
      auth,
      `+91${form.phone}`,
      recaptchaVerifier
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
    const result = await window.confirmationResult.confirm(form.otp)
    await login()

    toast.add({
      title: 'Client added successfully',
      id: 'login-success',
      color: 'green',
    })
    props.onVerify()
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
    <UCard :ui="{ base: 'h-full flex flex-col', body: { base: 'grow' } }">
      <template #header></template>

      <UForm
        v-if="!showOtpInput"
        :state="form"
        @submit.prevent="sendOtp"
        class="space-y-4 flex flex-col items-center justify-center w-full"
      >
        <div class="w-full max-w-md">
          <UFormGroup label="Phone Number" name="phone" class="w-full">
            <UInput
              v-model="phoneNo"
              type="tel"
              placeholder="Enter your phone number"
              class="w-full"
            >
              <template #leading>+91</template>
            </UInput>
          </UFormGroup>

          <div id="recaptcha-container" class="my-4" />

          <div class="text-end w-full">
            <UButton :loading="issendotp" type="submit">Send OTP</UButton>
          </div>
        </div>
      </UForm>

      <UForm
        v-else
        @submit.prevent="verifyOtp"
        class="space-y-4 flex flex-col items-center justify-center w-full"
      >
        <div class="w-full">
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
            <UButton :loading="isverifyotp" type="submit">Verify OTP</UButton>
          </div>
        </div>
      </UForm>

      <template #footer></template>
    </UCard>
  </UModal>
</template>
