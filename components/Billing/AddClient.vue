<script setup lang="ts">
import { reactive, ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useFindUniqueClient, useCreateClient, useUpdateClient } from '~/lib/hooks'
import { v4 as uuidv4 } from 'uuid'

const useAuth = () => useNuxtApp().$auth

const model = defineModel('model')
const phoneNo = defineModel('phoneNo')
const props = defineProps(['onVerify', 'clientAdded'])

const phoneRef = ref<any>(null)
const nameRef = ref<any>(null)
const emailRef = ref<any>(null)
const continueRef = ref<any>(null)

const toast = useToast()

const CreateClient = useCreateClient({
  optimisticUpdate: true,
  invalidateQueries: false,
})

const UpdateClient = useUpdateClient({
  optimisticUpdate: true,
  invalidateQueries: false,
})

const isSaving = ref(false)
const isHydratingClient = ref(false)

const form = reactive({
  phone: '',
  name: '',
  email: '',
})

const normalizePhoneDigits = (value: unknown) => String(value || '').replace(/\D/g, '').slice(-10)
const phoneDigits = computed(() => normalizePhoneDigits(form.phone))
const isValidPhone = computed(() => phoneDigits.value.length === 10)

const args = computed(() => ({
  where: { phone: `+91${phoneDigits.value}` },
  include: {
    companies: {
      select: { companyId: true },
    },
  },
}))

const { data: client, isLoading, refetch: refetchClient } = useFindUniqueClient(
  args,
  computed(() => ({
    enabled: isValidPhone.value,
  }))
)

const applyClientToForm = (existingClient: any) => {
  form.name = existingClient?.name || ''
  form.email = existingClient?.email || ''
}

watch(phoneNo, (val) => {
  const rawValue = String(val || '').trim()
  const digits = normalizePhoneDigits(rawValue)

  form.phone = digits

  if (!digits && rawValue) {
    form.name = rawValue
  }
})

watch(client, (val) => {
  if (val) {
    applyClientToForm(val)
    return
  }

  const rawValue = String(phoneNo.value || '').trim()
  const hasPhoneSeed = normalizePhoneDigits(rawValue).length > 0

  form.email = ''

  if (!hasPhoneSeed && rawValue) {
    form.name = rawValue
  } else {
    form.name = ''
  }
})

watch(phoneDigits, (digits) => {
  if (digits.length < 10 && !String(phoneNo.value || '').trim()) {
    form.name = ''
    form.email = ''
  }
})

watch(model, (isOpen) => {
  if (!isOpen) return

  const rawValue = String(phoneNo.value || '').trim()
  const digits = normalizePhoneDigits(rawValue)

  form.phone = digits
  form.email = ''

  if (!digits && rawValue) {
    form.name = rawValue
  } else if (!client.value) {
    form.name = ''
  }
})

const getExistingClient = async () => {
  if (!isValidPhone.value) return client.value

  try {
    const result = await refetchClient()
    return result?.data || client.value
  } catch {
    return client.value
  }
}

const hydrateClientFromPhone = async () => {
  if (!isValidPhone.value || isHydratingClient.value) return client.value

  isHydratingClient.value = true

  try {
    const existingClient = await getExistingClient()

    if (existingClient?.id) {
      applyClientToForm(existingClient)
      return existingClient
    }

    form.name = ''
    form.email = ''
    return null
  } finally {
    isHydratingClient.value = false
  }
}

const handleEnterFlow = async (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return

  e.preventDefault()

  const active = document.activeElement as HTMLElement

  if (phoneRef.value?.$el?.contains(active)) {
    const existingClient = await hydrateClientFromPhone()
    await nextTick()
    if (existingClient?.id) {
      continueRef.value?.$el?.focus()
    } else {
      nameRef.value?.$el?.querySelector('input')?.focus()
    }
    return
  }

  if (nameRef.value?.$el?.contains(active)) {
    await nextTick()
    emailRef.value?.$el?.querySelector('input')?.focus()
    return
  }

  if (emailRef.value?.$el?.contains(active)) {
    await nextTick()
    continueRef.value?.$el?.focus()
    return
  }

  if (continueRef.value?.$el === active && !isSaving.value) {
    login()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEnterFlow)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEnterFlow)
})

const currentCompanyId = computed(() => useAuth().session.value?.companyId)

const isUniquePhoneError = (error: any) => {
  const message = String(error?.info?.message || error?.data?.message || error?.message || '')

  return (
    error?.code === 'P2002' ||
    error?.info?.code === 'P2002' ||
    error?.data?.code === 'P2002' ||
    message.includes('Unique constraint failed')
  )
}

const linkClientToCompany = async (existingClient: any) => {
  const companyId = currentCompanyId.value

  if (!companyId) {
    throw new Error('Company not found')
  }

  const isLinked = existingClient?.companies?.some((c: any) => c.companyId === companyId)

  if (isLinked) return

  const { number: clientNumber } = await $fetch('/api/counter/increment', {
    method: 'POST',
    body: { entity: 'client' },
  })

  await UpdateClient.mutateAsync({
    where: { id: existingClient.id },
    data: {
      companies: {
        create: {
          clientNumber,
          company: {
            connect: {
              id: companyId,
            },
          },
        },
      },
    },
  })
}

const login = async () => {
  if (isSaving.value || !isValidPhone.value || !form.name) return

  isSaving.value = true
  const phone = `+91${phoneDigits.value}`

  try {
    const companyId = currentCompanyId.value

    if (!companyId) {
      throw new Error('Company not found')
    }

    const existingClient = await getExistingClient()

    if (existingClient?.id) {
      await linkClientToCompany(existingClient)
      props.clientAdded(existingClient.id, existingClient.name || form.name, phoneDigits.value)
    } else {
      const uuid = uuidv4()
      const { number: clientNumber } = await $fetch('/api/counter/increment', {
        method: 'POST',
        body: { entity: 'client' },
      })

      try {
        await CreateClient.mutateAsync({
          data: {
            id: uuid,
            name: form.name,
            phone,
            ...(form.email && { email: form.email }),
            companies: {
              create: {
                clientNumber,
                company: {
                  connect: {
                    id: companyId,
                  },
                },
              },
            },
          },
        })
        props.clientAdded(uuid, form.name, phoneDigits.value)
      } catch (error: any) {
        if (!isUniquePhoneError(error)) throw error

        const racedClient = await getExistingClient()

        if (!racedClient?.id) throw error

        await linkClientToCompany(racedClient)
        props.clientAdded(racedClient.id, racedClient.name || form.name, phoneDigits.value)
      }
    }

    toast.add({
      title: 'Client added successfully',
      color: 'green',
    })

    phoneNo.value = phoneDigits.value
    model.value = false
  } catch (error: any) {
    toast.add({
      title: 'Failed to add client',
      description: error?.info?.message || error?.message || 'Please try again',
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UModal v-model="model">
    <UCard
      :ui="{
        base: 'h-full flex flex-col',
        body: { base: 'grow' }
      }"
    >
      <UForm
        :state="form"
        @submit.prevent="login"
        class="space-y-4 flex flex-col items-center justify-center w-full"
      >
        <div class="w-full max-w-md">
          <UFormGroup label="Phone Number">
            <UInput
              ref="phoneRef"
              v-model="form.phone"
              type="tel"
              placeholder="Enter phone"
              :loading="isLoading || isHydratingClient"
            >
              <template #leading>+91</template>
            </UInput>
          </UFormGroup>

          <UFormGroup v-if="!isLoading" label="Name">
            <UInput
              ref="nameRef"
              v-model="form.name"
              placeholder="Enter name"
            />
          </UFormGroup>

          <UFormGroup v-if="!isLoading" label="Email">
            <UInput
              ref="emailRef"
              v-model="form.email"
              placeholder="Enter email"
            />
          </UFormGroup>

          <div class="text-end mt-4">
            <UButton
              ref="continueRef"
              type="submit"
              :loading="isSaving"
              :disabled="!form.name || !isValidPhone"
            >
              Continue
            </UButton>
          </div>
        </div>
      </UForm>
    </UCard>
  </UModal>
</template>
