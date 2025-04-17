<template>
    <UDashboardPanelContent>
    <div class="p-6 space-y-6">
      <UCard v-for="bill in bills" :key="bill.id" class="shadow-xl">
        <template #header>
          <div class="flex justify-between items-center">
            <div>
              <h2 class="text-xl font-bold">Order #{{ bill.invoiceNumber }}</h2>
              <p class="text-sm text-gray-500">Date: {{ formatDate(bill.createdAt) }}</p>
              <p class="text-sm text-gray-500">Status: <UBadge :color="statusColor(bill.status)">{{ bill.status }}</UBadge></p>
            </div>
            <div class="space-x-2">
              <UButton color="blue" variant="ghost">Track Shipment</UButton>
              <UButton color="red" variant="ghost" v-if="bill.status === 'processing'">Cancel Order</UButton>
              <UButton color="yellow" variant="ghost" v-if="bill.status === 'delivered'">Request Return</UButton>
              <UButton color="gray" variant="ghost">Contact Support</UButton>
              <UButton color="green" variant="ghost">Reorder</UButton>
              <UButton color="indigo" variant="ghost">Leave Review</UButton>
            </div>
          </div>
        </template>
  
        <div class="space-y-4">
          <div v-for="entry in bill.entries" :key="entry.id" class="flex gap-4 items-start">
            <img :src="entry.variant?.images?.[0] || 'https://via.placeholder.com/80'" alt="Product Image" class="w-20 h-20 rounded-md border" />
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
            <div><strong>Payment Status:</strong> <UBadge :color="bill.paymentStatus === 'PAID' ? 'green' : 'red'">{{ bill.paymentStatus }}</UBadge></div>
          </div>
  
          <UDivider />
  
          <div class="text-sm">
            <p><strong>Delivery Address:</strong></p>
            <p>{{ bill.address?.name }}, {{ bill.address?.street }}, {{ bill.address?.locality }}</p>
            <p>{{ bill.address?.city }}, {{ bill.address?.state }} - {{ bill.address?.pincode }}</p>
          </div>
  
          <div class="text-sm text-gray-700">
            <p><strong>Notes:</strong> {{ bill.notes || 'No additional notes.' }}</p>
          </div>
        </div>
      </UCard>
    </div>
</UDashboardPanelContent>
  </template>
  
  <script setup>
  const bills = [
  {
    id: '1',
    invoiceNumber: 1001,
    createdAt: new Date(),
    subtotal: 1200,
    discount: 100,
    tax: 60,
    deliveryFees: 40,
    grandTotal: 1200,
    paymentStatus: 'PAID',
    status: 'delivered',
    notes: 'Please leave at the reception.',
    entries: [
      {
        id: 'e1',
        name: 'Black T-Shirt',
        qty: 1,
        rate: 400,
        size: 'L',
        category: { name: 'T-Shirts' },
        variant: { images: ['https://via.placeholder.com/100'] },
      },
      {
        id: 'e2',
        name: 'Running Shoes',
        qty: 1,
        rate: 700,
        size: '9',
        category: { name: 'Footwear' },
        variant: { images: ['https://via.placeholder.com/100'] },
      }
    ],
    address: {
      name: 'Alice Johnson',
      street: '456 Elm Street',
      locality: 'Park Avenue',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    },
  },
  {
    id: '2',
    invoiceNumber: 1002,
    createdAt: new Date(),
    subtotal: 850,
    discount: 50,
    tax: 45,
    deliveryFees: 30,
    grandTotal: 875,
    paymentStatus: 'PENDING',
    status: 'processing',
    notes: '',
    entries: [
      {
        id: 'e3',
        name: 'Denim Jeans',
        qty: 1,
        rate: 850,
        size: '32',
        category: { name: 'Jeans' },
        variant: { images: ['https://via.placeholder.com/100'] },
      }
    ],
    address: {
      name: 'Rahul Verma',
      street: '789 Lake Road',
      locality: 'Sector 5',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001'
    },
  },
  {
    id: '3',
    invoiceNumber: 1003,
    createdAt: new Date(),
    subtotal: 2400,
    discount: 200,
    tax: 100,
    deliveryFees: 60,
    grandTotal: 2360,
    paymentStatus: 'PAID',
    status: 'cancelled',
    notes: 'Customer cancelled the order.',
    entries: [
      {
        id: 'e4',
        name: 'Formal Shirt',
        qty: 2,
        rate: 600,
        size: 'M',
        category: { name: 'Shirts' },
        variant: { images: ['https://via.placeholder.com/100'] },
      },
      {
        id: 'e5',
        name: 'Leather Belt',
        qty: 1,
        rate: 700,
        size: 'Free',
        category: { name: 'Accessories' },
        variant: { images: ['https://via.placeholder.com/100'] },
      },
      {
        id: 'e6',
        name: 'Chinos',
        qty: 1,
        rate: 500,
        size: '34',
        category: { name: 'Pants' },
        variant: { images: ['https://via.placeholder.com/100'] },
      }
    ],
    address: {
      name: 'Mohit Singh',
      street: '22 Green Street',
      locality: 'Green Park',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600020'
    },
  }
]

  const formatDate = (date) => new Date(date).toLocaleDateString()
  
  const statusColor = (status) => {
    switch (status) {
      case 'processing': return 'yellow';
      case 'delivered': return 'green';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  }
  </script>
  
  <style scoped>
  </style>
  