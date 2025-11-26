<template>
    <div class="flex items-center justify-center min-h-[85vh]">
      <UCard class="text-center">
        <template #header>
          <h2 class="text-lg font-semibold">Your Cart is Empty</h2>
        </template>
  
        <p class="mb-4">It looks like you haven't added any items to your cart yet.</p>
  
        <template #footer>
          <UButton to="./" color="primary" variant="solid">
            Return to Home
          </UButton>
        </template>
      </UCard>
    </div>
  </template>
  
  <script setup lang="ts">

  </script>
  
  
  