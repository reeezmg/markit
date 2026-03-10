<script setup>
const emit = defineEmits(['account-created'])
const open = defineModel()

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

const account = ref({
  name: '',
  phone: '',
  street: '',
  locality: '',
  city: '',
  state: '',
  pincode: '',
})
const isSaving = ref(false)

const submitForm = async () => {
  isSaving.value = true
  try {
    if (!account.value.name) throw new Error('Please fill name')

    const companyId = useAuth().session.value?.companyId
    if (!companyId) throw new Error('Company not found')

    await $fetch('/api/bill/createAccount', {
      method: 'POST',
      body: {
        name: account.value.name,
        phone: account.value.phone,
        companyId,
        address: {
          street: account.value.street,
          locality: account.value.locality,
          city: account.value.city,
          state: account.value.state,
          pincode: account.value.pincode,
        },
      },
    })

    toast.add({ title: 'Account added!', id: 'modal-success' })
    emit('account-created')
    open.value = false
    account.value = { name: '', phone: '', street: '', locality: '', city: '', state: '', pincode: '' }
  } catch (error) {
    toast.add({
      title: 'Account creation failed!',
      description: error.message || 'Something went wrong',
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UModal v-model="open">
    <div class="p-4 space-y-4">
      <h2 class="text-lg font-semibold">Enter Account Details</h2>

      <h3 class="text-md font-semibold">Personal Details</h3>
      <UInput v-model="account.name" label="Name" placeholder="Enter full name" required />
      <UInput v-model="account.phone" label="Phone No" placeholder="Enter Phone Number" required />

      <h3 class="text-md font-semibold mt-4">Address Details</h3>
      <UInput v-model="account.street" label="Street" placeholder="Enter street name" required />
      <UInput v-model="account.locality" label="Locality" placeholder="Enter locality" required />
      <UInput v-model="account.city" label="City" placeholder="Enter city name" required />
      <UInput v-model="account.state" label="State" placeholder="Enter state name" required />
      <UInput v-model="account.pincode" label="Pincode" placeholder="Enter pincode" required />

      <UButton @click="submitForm" :loading="isSaving" block>Submit</UButton>
    </div>
  </UModal>
</template>
