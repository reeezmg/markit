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

const form = reactive({
  phone: '',
  name: '',
  email: '',
})

const phoneDigits = computed(() => String(form.phone || '').replace(/\D/g, '').slice(0, 10))
const isValidPhone = computed(() => phoneDigits.value.length === 10)

const args = computed(() => ({
  where: { phone: `+91${phoneDigits.value}` },
  include: {
    companies: {
      select: { companyId: true },
    },
  },
}))

const { data: client, isLoading } = useFindUniqueClient(
  args,
  computed(() => ({
    enabled: isValidPhone.value,
  }))
)

watch(phoneNo, (val) => {
  const rawValue = String(val || '').trim()
  const digits = rawValue.replace(/\D/g, '').slice(0, 10)

  form.phone = digits

  if (!digits && rawValue) {
    form.name = rawValue
  }
})

watch(client, (val) => {
  if (val) {
    form.name = val.name
    form.email = val.email || ''
  } else if (!String(phoneNo.value || '').replace(/\D/g, '').length) {
    form.email = ''
  }
})

watch(model, (isOpen) => {
  if (!isOpen) return

  const rawValue = String(phoneNo.value || '').trim()
  const digits = rawValue.replace(/\D/g, '').slice(0, 10)

  form.phone = digits
  form.email = ''

  if (!digits && rawValue) {
    form.name = rawValue
  } else if (!client.value) {
    form.name = ''
  }
})

const handleEnterFlow = async (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return

  e.preventDefault()

  const active = document.activeElement as HTMLElement

  if (phoneRef.value?.$el?.contains(active)) {
    await nextTick()
    nameRef.value?.$el?.querySelector('input')?.focus()
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

const login = async () => {
  if (isSaving.value || !isValidPhone.value || !form.name) return

  isSaving.value = true
  const uuid = uuidv4()

  try {
    if (!client.value) {
      const { number: clientNumber } = await $fetch('/api/counter/increment', {
        method: 'POST',
        body: { entity: 'client' },
      })

      await CreateClient.mutate({
        data: {
          id: uuid,
          name: form.name,
          phone: `+91${phoneDigits.value}`,
          ...(form.email && { email: form.email }),
          companies: {
            create: {
              clientNumber,
              company: {
                connect: {
                  id: useAuth().session.value?.companyId,
                },
              },
            },
          },
        },
      })

      props.clientAdded(uuid, form.name, phoneDigits.value)
    } else {
      const isLinked = client.value.companies?.some(
        (c: any) => c.companyId === useAuth().session.value?.companyId
      )

      if (!isLinked) {
        const { number: clientNumber } = await $fetch('/api/counter/increment', {
          method: 'POST',
          body: { entity: 'client' },
        })

        await UpdateClient.mutate({
          where: { id: client.value.id },
          data: {
            companies: {
              create: {
                clientNumber,
                company: {
                  connect: {
                    id: useAuth().session.value?.companyId,
                  },
                },
              },
            },
          },
        })
      }

      props.clientAdded(client.value.id, form.name, phoneDigits.value)
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
      description: error?.message || 'Please try again',
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
              :loading="isLoading"
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
