   <script setup lang="ts">
   // Adjust based on your project
   import { useFindManyBill } from '~/lib/hooks' // ZenStack hook
   import { format } from 'date-fns'
   
   const { session } = useAuth()
   
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
     <UDashboardPanelContent>
       <div class="p-6 space-y-6">
         <UCard v-if="isLoading">Loading...</UCard>
         <UCard v-else-if="!bills?.length">No orders found.</UCard>
   
         <UCard v-for="bill in bills" :key="bill.id" class="shadow-xl">
           <template #header>
             <div class="flex justify-between items-center flex-wrap gap-2">
               <div>
                 <h2 class="text-xl font-bold">Order #{{ bill.invoiceNumber || 'N/A' }}</h2>
                 <p class="text-sm text-gray-500">Date: {{ formatDate(bill.createdAt) }}</p>
                 <p class="text-sm text-gray-500">
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
                  :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${entry.variant.images[0]}`"
                  alt="Product Image"
                  class="w-20 h-20 rounded-md border"
                />
                <!-- Skeleton or fallback -->
                <div
                  v-else
                  class="w-20 h-20 rounded-md border bg-gray-100 animate-pulse"
                />

               <div>
                 <p class="font-semibold">{{ entry.name }}</p>
                 <p class="text-sm text-gray-600">Category: {{ entry.category?.name || '-' }}</p>
                 <p class="text-sm">Qty: {{ entry.qty }} | Rate: ₹{{ entry.rate }}</p>
                 <p class="text-sm text-gray-500">Size: {{ entry.size }}</p>
               </div>
             </div>
   
             <UDivider />
   
             <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
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
   
             <UDivider />
   
             <div class="text-sm">
               <p><strong>Delivery Address:</strong></p>
               <p>
                 {{ bill.address?.name }}, {{ bill.address?.street }},
                 {{ bill.address?.locality }}
               </p>
               <p>
                 {{ bill.address?.city }}, {{ bill.address?.state }} -
                 {{ bill.address?.pincode }}
               </p>
             </div>
   
             <div class="text-sm text-gray-700">
               <p><strong>Notes:</strong> {{ bill.notes || 'No additional notes.' }}</p>
             </div>
           </div>
         </UCard>
       </div>
     </UDashboardPanelContent>
   </template>
   