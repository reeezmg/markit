<!-- components/CustomerCTA.vue -->
<template>
  <ULandingCTA
    title="Order from local shops near you"
    description="Skip the wait. Explore stores nearby, try products at home, and buy only what you love."
    align="center"
    :ui="{
      wrapper: 'max-w-4xl mx-auto',
      title: 'text-2xl sm:text-3xl text-center',
      description: 'text-center text-gray-500 mb-6'
    }"
  >
    <template #actions>
      <UButton
        to="/launching"
        size="lg"
        class="bg-[#097D4C] hover:bg-[#08643d] text-white"
      >
        Explore Stores Near You
      </UButton>
    </template>
  </ULandingCTA>
</template>
