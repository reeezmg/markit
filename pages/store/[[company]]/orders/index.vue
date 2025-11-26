<script setup lang="ts">
import { useFindManyBill } from '~/lib/hooks'
import { format } from 'date-fns'

import { useToast } from '#imports'

const toast = useToast()
const { session } = useAuth()
const isLoginModalOpen = ref(false)

// Show login modal if not authenticated
watch(() => session.value?.id, (isLoggedIn) => {
  if (!isLoggedIn) {
    isLoginModalOpen.value = true
  }
}, { immediate: true })

const { data: bills, isLoading, error } = useFindManyBill({
  where: {
    clientId: session.value?.id,
    deleted: false,
    NOT: {
      type: 'BILL'
    }
  },
  orderBy: {
    createdAt: 'desc'
  },
  include: {
    entries: {
      include: {
        category: true,
        variant: true
      }
    },
    address: true
  }
})

function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy')
}

function statusColor(status: string) {
  switch (status) {
    case 'processing':
      return 'blue'
    case 'delivered':
      return 'green'
    case 'cancelled':
      return 'red'
    default:
      return 'gray'
  }
}
</script>

<template>
  <UDashboardPanelContent class="bg-gray-50 dark:bg-gray-900">
    <!-- Logged In State -->
    <div v-if="session?.id" class="p-6 space-y-6">
      <UCard v-if="isLoading" class="dark:bg-gray-800">Loading...</UCard>
      <UCard v-else-if="!bills?.length" class="dark:bg-gray-800">
        No orders found.
      </UCard>

      <UCard 
        v-for="bill in bills" 
        :key="bill.id" 
        class="shadow-xl dark:bg-gray-800"
      >
        <template #header>
          <div class="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h2 class="text-xl font-bold dark:text-white">Order #{{ bill.invoiceNumber || 'N/A' }}</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">Date: {{ formatDate(bill.createdAt) }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Status:
                <UBadge :color="statusColor(bill.status ?? '')">
                  {{ bill.status }}
                </UBadge>
              </p>
            </div>
            <div class="space-x-2 flex flex-wrap justify-end">
              <UButton color="blue" variant="ghost">Track Shipment</UButton>
              <UButton color="red" variant="ghost" v-if="bill.status === 'CONFIRMED'">Cancel Order</UButton>
              <UButton color="yellow" variant="ghost" v-if="bill.status === 'DELIVERED'">Request Return</UButton>
              <UButton color="gray" variant="ghost">Contact Support</UButton>
              <UButton color="green" variant="ghost">Reorder</UButton>
              <UButton color="indigo" variant="ghost">Leave Review</UButton>
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <div v-for="entry in bill.entries" :key="entry.id" class="flex gap-4 items-start">
            <img
              v-if="entry.variant?.images?.[0]"
              :src="`https://images.markit.co.in/${entry.variant.images[0]}`"
              alt="Product Image"
              class="w-20 h-20 rounded-md border dark:border-gray-700"
            />
            <div
              v-else
              class="w-20 h-20 rounded-md border bg-gray-100 dark:bg-gray-700 dark:border-gray-600 animate-pulse"
            />

            <div>
              <p class="font-semibold dark:text-white">{{ entry.name }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-300">Category: {{ entry.category?.name || '-' }}</p>
              <p class="text-sm dark:text-gray-200">Qty: {{ entry.qty }} | Rate: ₹{{ entry.rate }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Size: {{ entry.size }}</p>
            </div>
          </div>

          <UDivider class="dark:border-gray-700" />

          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm dark:text-gray-200">
            <div><strong>Subtotal:</strong> ₹{{ bill.subtotal }}</div>
            <div><strong>Discount:</strong> ₹{{ bill.discount || 0 }}</div>
            <div><strong>Tax:</strong> ₹{{ bill.tax || 0 }}</div>
            <div><strong>Delivery Fees:</strong> ₹{{ bill.deliveryFees || 0 }}</div>
            <div><strong>Total:</strong> ₹{{ bill.grandTotal }}</div>
            <div>
              <strong>Payment Status:</strong>
              <UBadge :color="bill.paymentStatus === 'PAID' ? 'green' : 'red'">{{ bill.paymentStatus }}</UBadge>
            </div>
          </div>

          <UDivider class="dark:border-gray-700" />

          <div class="text-sm dark:text-gray-200">
            <p><strong>Delivery Address:</strong></p>
            <p class="dark:text-gray-300">
              {{ bill.address?.name }}, {{ bill.address?.street }},
              {{ bill.address?.locality }}
            </p>
            <p class="dark:text-gray-300">
              {{ bill.address?.city }}, {{ bill.address?.state }} -
              {{ bill.address?.pincode }}
            </p>
          </div>

          <div class="text-sm text-gray-700 dark:text-gray-400">
            <p><strong>Notes:</strong> {{ bill.notes || 'No additional notes.' }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Not Logged In State -->
    <div v-else class="text-center py-16">
      <UIcon name="i-heroicons-lock-closed" class="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500" />
      <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">You are not logged in</h3>
      <p class="mt-1 text-gray-500 dark:text-gray-400">Please login to view your orders</p>
      <UButton
        class="mt-6"
        @click="isLoginModalOpen = true"
        size="lg"
      >
        Sign In
      </UButton>
    </div>
  </UDashboardPanelContent>

  <!-- Login Modal -->
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
</template>