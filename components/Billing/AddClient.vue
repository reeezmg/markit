<script setup lang="ts">
import { reactive, ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useFindUniqueClient, useCreateClient, useUpdateClient } from '~/lib/hooks'
import { v4 as uuidv4 } from 'uuid'

const useAuth = () => useNuxtApp().$auth

/* =====================================================
   MODELS / PROPS
===================================================== */

const model = defineModel('model')
const phoneNo = defineModel('phoneNo')
const props = defineProps(['onVerify', 'clientAdded'])



/* =====================================================
   REFS — INPUT FLOW
===================================================== */

const phoneRef = ref<any>(null)
const nameRef = ref<any>(null)
const emailRef = ref<any>(null)
const continueRef = ref<any>(null)



/* =====================================================
   STATE
===================================================== */

const toast = useToast()

const CreateClient = useCreateClient({
  optimisticUpdate: true,
  invalidateQueries: false
})

const UpdateClient = useUpdateClient({
  optimisticUpdate: true,
  invalidateQueries: false
})

const isSaving = ref(false)

const form = reactive({
  phone: '',
  name: '',
  email: ''
})



/* =====================================================
   FETCH CLIENT
===================================================== */

const args = computed(() => ({
  where: { phone: `+91${form.phone}` },
  include: {
    companies: {
      select: { companyId: true },
    },
  },
}))

const { data: client, isLoading } =
  useFindUniqueClient(args)



/* =====================================================
   WATCHERS
===================================================== */

watch(phoneNo, (val) => {
  form.phone = val
})

watch(client, (val) => {
  if (val) {
    form.name = val.name
    form.email = val.email
  } else {
    form.name = ''
    form.email = ''
  }
})



/* =====================================================
   ENTER FLOW
===================================================== */

const handleEnterFlow = async (e: KeyboardEvent) => {

  if (e.key !== 'Enter') return

  e.preventDefault()

  const active = document.activeElement as HTMLElement



  /* PHONE → NAME */
  if (phoneRef.value?.$el?.contains(active)) {
    await nextTick()
    nameRef.value?.$el?.querySelector('input')?.focus()
    return
  }



  /* NAME → EMAIL */
  if (nameRef.value?.$el?.contains(active)) {
    await nextTick()
    emailRef.value?.$el?.querySelector('input')?.focus()
    return
  }



  /* EMAIL → CONTINUE */
  if (emailRef.value?.$el?.contains(active)) {
    await nextTick()
    continueRef.value?.$el?.focus()
    return
  }



  /* CONTINUE → PARENT DISCOUNT */
  /* CONTINUE → SUBMIT FLOW */
if (continueRef.value?.$el === active) {

  // let form submit handle login
  continueRef.value?.$el?.click()
    props.onVerify?.()

  return
}

}



onMounted(() => {
  window.addEventListener('keydown', handleEnterFlow)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEnterFlow)
})



/* =====================================================
   SUBMIT
===================================================== */

const login = async () => {

  isSaving.value = true
  const uuid = uuidv4()

  if (!client.value && form.name) {

    await CreateClient.mutate({
      data: {
        id: uuid,
        name: form.name,
        phone: `+91${form.phone}`,
        ...(form.email && { email: form.email }),
        companies: {
          create: {
            company: {
              connect: {
                id: useAuth().session.value?.companyId
              },
            },
          },
        },
      },
    })

    props.clientAdded(uuid, form.name, form.phone)

  } else if (client.value) {

    await UpdateClient.mutate({
      where: { id: client.value.id },
      data: {
        companies: {
          create: {
            company: {
              connect: {
                id: useAuth().session.value?.companyId
              },
            },
          },
        },
      },
    })

    props.clientAdded(client.value.id, form.name)
  }

  toast.add({
    title: 'Client added successfully',
    color: 'green'
  })

  model.value = false
  isSaving.value = false
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

          <!-- PHONE -->
          <UFormGroup label="Phone Number">
            <UInput
              ref="phoneRef"
              v-model="phoneNo"
              type="tel"
              placeholder="Enter phone"
              :loading="isLoading"
            >
              <template #leading>+91</template>
            </UInput>
          </UFormGroup>



          <!-- NAME -->
          <UFormGroup v-if="!isLoading" label="Name">
            <UInput
              ref="nameRef"
              v-model="form.name"
              placeholder="Enter name"
            />
          </UFormGroup>



          <!-- EMAIL -->
          <UFormGroup v-if="!isLoading" label="Email">
            <UInput
              ref="emailRef"
              v-model="form.email"
              placeholder="Enter email"
            />
          </UFormGroup>



          <!-- CONTINUE -->
          <div class="text-end mt-4">
            <UButton
              ref="continueRef"
              type="submit"
              :loading="isSaving"
              :disabled="!form.name"
            >
              Continue
            </UButton>
          </div>

        </div>

      </UForm>
    </UCard>
  </UModal>
</template>
