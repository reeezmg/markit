<script setup lang="ts">
// import { authClientLogin, authClientLogout, useClientAuth } from '~/composables/useAuth'
import { 
  useFindUniqueClient, 
  useUpdateClient, 
  useFindManyAddress,
  useCreateAddress,
  useUpdateAddress,
  useDeleteAddress
} from '~/lib/hooks'
import { useCartStore } from '~/stores/cartStore'
import { computed, watch } from 'vue'

definePageMeta({
  auth: false,
  layout: 'store',
})

const toast = useToast()
const authClient = useClientAuth()
const isLoginModalOpen = ref(false)
const cartStore = useCartStore();
const likeStore = useLikeStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const likeItemCount = computed(() => likeStore.likedCount);
const route = useRoute();

// Show login modal if not authenticated
watch(() => authClient.session.value?.id, (isLoggedIn) => {
  if (!isLoggedIn) {
    isLoginModalOpen.value = true
  }
}, { immediate: true })

// Fetch client data
const { data: client, refetch: refetchClient } = useFindUniqueClient({
  where: { id: authClient.session.value?.id },
  include: {
    address: true,
    companies: {
      select: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }
  }
})

// Reactive form for profile editing
const form = reactive({
  name: client.value?.name || '',
  email: client.value?.email || '',
  phone: client.value?.phone || ''
})

// Watch client changes to update form
watch(client, (newClient) => {
  if (newClient) {
    form.name = newClient.name
    form.email = newClient.email || ''
    form.phone = newClient.phone
  }
})

const editMode = ref(false)
const isAddressModalOpen = ref(false)
const editingAddressId = ref<string | null>(null)
const newAddress = reactive({
  name: '',
  street: '',
  locality: '',
  city: '',
  state: '',
  pincode: '',
  active: true
})

// Mutation hooks
const createAddressMutation = useCreateAddress()
const updateAddressMutation = useUpdateAddress()
const deleteAddressMutation = useDeleteAddress()

// Loading states
const isCreatingAddress = computed(() => createAddressMutation.status.value === 'pending')
const isUpdatingAddress = computed(() => updateAddressMutation.status.value === 'pending')
const isDeletingAddress = computed(() => deleteAddressMutation.status.value === 'pending')

const UpdateClient = useUpdateClient()

const handleUpdateProfile = async () => {
  try {
    await UpdateClient.mutateAsync({
      where: { id: authClient.session.value?.id },
      data: {
        name: form.name,
        email: form.email
      }
    })
    await refetchClient()
    toast.add({ title: 'Profile updated successfully', color: 'green' })
    editMode.value = false
  } catch (error) {
    toast.add({ title: 'Error updating profile', color: 'red' })
    console.error(error)
  }
}

const handleLogout = async () => {
  try {
    await authClientLogout()
    cartStore.clearCart()
    isLoginModalOpen.value = true
    toast.add({ title: 'Logged out successfully', color: 'green' })
  } catch (error) {
    toast.add({ title: 'Error logging out', color: 'red' })
    console.error(error)
  }
}

const openAddressModal = (address: {
  id: string
  name: string | null
  street: string
  locality: string | null
  city: string
  state: string
  pincode: string
  active: boolean
} | null) => {
  if (address) {
    editingAddressId.value = address.id
    Object.assign(newAddress, {
      name: address.name || '',
      street: address.street,
      locality: address.locality || '',
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      active: address.active
    })
  } else {
    editingAddressId.value = null
    Object.assign(newAddress, {
      name: '',
      street: '',
      locality: '',
      city: '',
      state: '',
      pincode: '',
      active: true
    })
  }
  isAddressModalOpen.value = true
}

const handleSaveAddress = async () => {
  try {
    const addressData = {
      name: newAddress.name,
      street: newAddress.street,
      locality: newAddress.locality,
      city: newAddress.city,
      state: newAddress.state,
      pincode: newAddress.pincode,
      active: newAddress.active,
      client: { connect: { id: authClient.session.value?.id } }
    }

    if (editingAddressId.value) {
      await updateAddressMutation.mutateAsync({
        where: { id: editingAddressId.value },
        data: addressData
      })
      toast.add({ title: 'Address updated successfully', color: 'green' })
    } else {
      await createAddressMutation.mutateAsync({
        data: addressData
      })
      toast.add({ title: 'Address added successfully', color: 'green' })
    }

    isAddressModalOpen.value = false
    await refetchClient()
  } catch (error) {
    toast.add({ 
      title: editingAddressId.value ? 'Error updating address' : 'Error adding address', 
      color: 'red' 
    })
    console.error(error)
  }
}

const handleDeleteAddress = async (addressId: string) => {
  try {
    await deleteAddressMutation.mutateAsync({
      where: { id: addressId }
    })
    toast.add({ title: 'Address deleted successfully', color: 'green' })
    await refetchClient()
  } catch (error) {
    toast.add({ title: 'Error deleting address', color: 'red' })
    console.error(error)
  }
}

// Fetch addresses
const { data: addresses } = useFindManyAddress({
  where: { clientId: authClient.session.value?.id }
})
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="My Profile">
        <template #right>
          <div class="flex flex-row items-end justify-end">
            <UButton 
              v-if="!useClientAuth().session.value?.id" 
              @click="isLoginModalOpen = true"
              class="px-5 me-3 flex items-center justify-center rounded-md border border-transparent text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              Login
            </UButton>
<UTooltip class="me-3" text="Cart" :shortcuts="['C']">
  <NuxtLink :to="formatStoreRoute(route.params.company, 'checkout')">
    <ClientOnly>
      <UChip :text="cartItemCount" color="red" size="2xl">
        <UIcon name="i-heroicons-shopping-cart" class="w-5 h-5" />
      </UChip>
    </ClientOnly>
  </NuxtLink>
</UTooltip>
            <UTooltip class="me-3" text="Wishlist" :shortcuts="['W']">
              <NuxtLink to="./wishlist">
                <UChip :text="likeItemCount" color="red" size="2xl">
                  <UIcon name="i-heroicons-heart" class="w-5 h-5" />
                </UChip>
              </NuxtLink>
            </UTooltip>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        
        <div v-if="authClient.session.value?.id" class="min-h-screen bg-gray-50">
          <UContainer class="py-8">
            <div class="flex flex-col md:flex-row gap-8">
             
              <div class="w-full md:w-64 flex-shrink-0">
                <div class="bg-white rounded-lg shadow p-4 sticky top-8">
                  <div class="flex flex-col items-center py-4 border-b">
                    <UAvatar 
                      :alt="client?.name || 'User'" 
                      size="lg" 
                      class="mb-3"
                      :ui="{ size: { lg: 'w-16 h-16' } }"
                    />
                    <h3 class="font-semibold text-lg text-center">{{ client?.name }}</h3>
                    <p class="text-gray-500 text-sm text-center">{{ client?.email }}</p>
                    <p class="text-gray-500 text-sm mt-1">{{ client?.phone }}</p>
                  </div>
                  
                  <UVerticalNavigation 
                    :links="[
                      { label: 'My Profile', icon: 'i-heroicons-user', to: '#profile' },
                      { label: 'My Addresses', icon: 'i-heroicons-map-pin', to: '#addresses' },
                      // { label: 'My Companies', icon: 'i-heroicons-building-office', to: '#companies' },
                      { label: 'Logout', icon: 'i-heroicons-arrow-left-on-rectangle', click: handleLogout }
                    ]" 
                    class="mt-4"
                  />
                </div>
              </div>

       
              <div class="flex-1">
              
                <div id="profile" class="bg-white rounded-lg shadow p-6 mb-6">
                  <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold">My Profile</h2>
                    <UButton
                      v-if="!editMode"
                      variant="outline"
                      @click="editMode = true"
                      icon="i-heroicons-pencil-square"
                    >
                      Edit
                    </UButton>
                    <div v-else class="space-x-2">
                      <UButton
                        variant="outline"
                        color="gray"
                        @click="editMode = false"
                      >
                        Cancel
                      </UButton>
                      <UButton
                        @click="handleUpdateProfile"
                        icon="i-heroicons-check"
                      >
                        Save
                      </UButton>
                    </div>
                  </div>

                  <div class="space-y-4">
                    <UFormGroup label="Full Name">
                      <UInput v-model="form.name" :disabled="!editMode" />
                    </UFormGroup>

                    <UFormGroup label="Email">
                      <UInput v-model="form.email" type="email" :disabled="!editMode" />
                    </UFormGroup>

                    <UFormGroup label="Phone Number">
                      <UInput v-model="form.phone" type="tel" disabled />
                      <template #help>
                        <span class="text-xs text-gray-500">Contact support to change your phone number</span>
                      </template>
                    </UFormGroup>
                  </div>
                </div>

           
                <!-- <div id="companies" class="bg-white rounded-lg shadow p-6 mb-6" v-if="client?.companies?.length">
                  <h2 class="text-xl font-bold mb-6">My Companies</h2>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div 
                      v-for="company in client.companies" 
                      :key="company.company.id"
                      class="border rounded-lg p-4 hover:border-primary-500 transition-colors"
                    >
                      <h3 class="font-medium">{{ company.company.name }}</h3>
                      <div class="mt-4">
                        <UButton 
                          size="xs"
                          variant="outline"
                          icon="i-heroicons-arrow-right"
                          @click="navigateTo(`/${company.company.name}`)"
                        >
                          Visit Store
                        </UButton>
                      </div>
                    </div>
                  </div>
                </div> -->

                
                <div id="addresses" class="bg-white rounded-lg shadow p-6">
                  <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold">My Addresses</h2>
                    <UButton
                      @click="openAddressModal(null)"
                      icon="i-heroicons-plus"
                    >
                      Add New Address
                    </UButton>
                  </div>

                  <div v-if="client?.address?.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      v-for="addr in client.address"
                      :key="addr.id"
                      class="border rounded-lg p-4 hover:border-primary-500 transition-colors relative"
                    >
                      <div class="flex justify-between items-start">
                        <div>
                          <h3 class="font-medium">{{ addr.name || 'My Address' }}</h3>
                          <p class="text-gray-600 text-sm mt-1">{{ addr.street }}</p>
                          <p class="text-gray-600 text-sm" v-if="addr.locality">{{ addr.locality }}</p>
                          <p class="text-gray-600 text-sm">
                            {{ addr.city }}, {{ addr.state }} - {{ addr.pincode }}
                          </p>
                        </div>
                        <UBadge v-if="addr.active" color="green" variant="subtle">
                          Active
                        </UBadge>
                        <UBadge v-else color="gray" variant="subtle">
                          Inactive
                        </UBadge>
                      </div>
                      <div class="mt-4 flex space-x-2">
                        <UButton
                          size="xs"
                          variant="outline"
                          icon="i-heroicons-pencil-square"
                          @click="openAddressModal(addr)"
                        >
                          Edit
                        </UButton>
                        <UButton
                          size="xs"
                          variant="outline"
                          color="red"
                          icon="i-heroicons-trash"
                          :loading="isDeletingAddress"
                          @click="handleDeleteAddress(addr.id)"
                        >
                          Delete
                        </UButton>
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-center py-8 text-gray-500">
                    <UIcon name="i-heroicons-map-pin" class="w-12 h-12 mx-auto text-gray-300" />
                    <p class="mt-2">No addresses saved yet</p>
                  </div>
                </div>
              </div>
            </div>
          </UContainer>
        </div>

       
        <div v-else class="text-center py-16">
          <UIcon name="i-heroicons-lock-closed" class="w-12 h-12 mx-auto text-gray-400" />
          <h3 class="mt-4 text-lg font-medium text-gray-900">Please login to view your profile</h3>
          <p class="mt-1 text-gray-500">Access your account details, addresses and more</p>
          <UButton
            class="mt-6"
            @click="isLoginModalOpen = true"
            size="lg"
          >
            Sign In
          </UButton>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>

  <UModal v-model="isLoginModalOpen">
    <UCard>
      <template #header>
        <div class="font-semibold text-center">Login</div>
      </template>
      <div class="p-4">
        <CheckoutLogin @close="isLoginModalOpen = false" />
      </div>
    </UCard>
  </UModal>

 
  <UModal v-model="isAddressModalOpen">
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-semibold">
            {{ editingAddressId ? 'Edit Address' : 'Add New Address' }}
          </h3>
          <UButton 
            color="gray" 
            variant="ghost" 
            icon="i-heroicons-x-mark-20-solid" 
            @click="isAddressModalOpen = false"
          />
        </div>
      </template>

      <UFormGroup label="Address Name (Optional)" class="mb-4">
        <UInput v-model="newAddress.name" placeholder="Home, Work, etc." />
      </UFormGroup>

      <UFormGroup label="Street Address" class="mb-4" required>
        <UInput v-model="newAddress.street" placeholder="House number, street name" />
      </UFormGroup>

      <UFormGroup label="Locality (Optional)" class="mb-4">
        <UInput v-model="newAddress.locality" placeholder="Area/Locality" />
      </UFormGroup>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <UFormGroup label="City" required>
          <UInput v-model="newAddress.city" />
        </UFormGroup>
        <UFormGroup label="State" required>
          <UInput v-model="newAddress.state" />
        </UFormGroup>
      </div>

      <UFormGroup label="Pincode" required>
        <UInput v-model="newAddress.pincode" />
      </UFormGroup>

      <UCheckbox v-model="newAddress.active" label="Set as active address" class="mb-4" />

      <template #footer>
        <div class="flex justify-end space-x-3">
          <UButton color="gray" variant="outline" @click="isAddressModalOpen = false">Cancel</UButton>
          <UButton 
            @click="handleSaveAddress"
            :loading="isCreatingAddress || isUpdatingAddress"
          >
            {{ editingAddressId ? 'Update' : 'Save' }} Address
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
