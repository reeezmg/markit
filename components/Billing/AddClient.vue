<script setup>
import { reactive, ref, watch, computed } from 'vue'
import { useFindUniqueClient, useCreateClient, useUpdateClient } from '~/lib/hooks'
import { v4 as uuidv4 } from 'uuid';

const useAuth = () => useNuxtApp().$auth

const model = defineModel('model')        // maps to v-model:model
const phoneNo = defineModel('phoneNo')    // maps to v-model:phoneNo
const props = defineProps(['onVerify', 'clientAdded'])

const toast = useToast()
const CreateClient = useCreateClient({ optimisticUpdate: true,invalidateQueries: false  })
const UpdateClient = useUpdateClient({ optimisticUpdate: true ,invalidateQueries: false })
const isSaving = ref(false)

const form = reactive({
  phone: '',
  name: '',
  email: ''
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
  refetch,
} = useFindUniqueClient(args)

watch(phoneNo, (newPhoneNo) => {
  form.phone = newPhoneNo
})

watch(client, (newClient) => {
  console.log(newClient)
  if(newClient){
    form.name = newClient.name
    form.email = newClient.email
  }else{
     form.name = ""
    form.email = ""
  }
 
})

const login = () => {
isSaving.value = true;
const uuid = uuidv4();
  if (!client.value && form.name) {
    try {
      const res = CreateClient.mutate({
        data: {
          id: uuid,
          name: form.name,
          phone: `+91${form.phone}`,
          ...(form.email && { email: form.email }),
          companies: {
            create: {
              company: {
                connect: { id: useAuth().session.value?.companyId },
              },
            },
          },
        },
      })
      props.clientAdded(uuid, form.name,form.phone)
    } catch (err) {
      console.error(err)
    }finally{
      isSaving.value = false;
      form.name = ""
    form.email = ""
    }
  } else if (client.value) {
    try {
      const res = UpdateClient.mutate({
        where: { id: client.value.id },
        data: {
          companies: {
            create: {
              company: {
                connect: { id: useAuth().session.value?.companyId },
              },
            },
          },
        },
      })
      props.clientAdded(client.value.id, form.name)
    } catch (err) {
      console.error(err)
    }finally{
      isSaving.value = false;
      form.name = ""
    form.email = ""
    }
  }

  toast.add({
    title: 'Client added successfully',
    id: 'login-success',
    color: 'green',
  })
  model.value = false

}


</script>

<template>
  <UModal v-model="model">
    <UCard
      :ui="{
        base: 'h-full flex flex-col',
        rounded: '',
        divide: 'divide-y divide-gray-100 dark:divide-gray-800',
        body: { base: 'grow' }
      }"
    >
      <UForm
        :state="form"
        @submit.prevent="login"
        class="space-y-4 flex flex-col items-center justify-center w-full"
      >
        <div class="w-full max-w-md">
          <UFormGroup label="Phone Number" name="phone" class="w-full">
            <UInput
              v-model="phoneNo"
              type="tel"
              placeholder="Enter your phone number"
              class="w-full mb-3"
              :loading="isLoading"
            >
              <template #leading>
                +91
              </template>
            </UInput>
          </UFormGroup>

          <UFormGroup v-if="!isLoading"  label="Enter Name" name="name">
            <UInput
              v-model="form.name"
              type="text"
              placeholder="Enter your name"
              class="w-full mb-3"
            />
          </UFormGroup>

          <UFormGroup v-if="!isLoading"  label="Enter Email" name="email" hint="Optional">
            <UInput
              v-model="form.email"
              type="email"
              placeholder="Enter your email"
              class="w-full mb-3"
            />
          </UFormGroup>

          <div class="text-end w-full mt-4">
            <UButton type="submit" :loading="isSaving" :disabled="!form.name">
              Continue
            </UButton>
          </div>
        </div>
      </UForm>
    </UCard>
  </UModal>
</template>
