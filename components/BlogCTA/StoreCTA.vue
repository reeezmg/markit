<!-- components/BlogCTA.vue -->
<template>
  <ULandingCTA
    title="Grow your local store with Markit"
    description="Join 100+ stores simplifying delivery, try-at-home with Markit."
    align="center"
    :ui="{
      wrapper: 'max-w-4xl mx-auto',
      title: 'text-2xl sm:text-3xl text-center',
      description: 'text-center text-gray-500 mb-6'
    }"
  >
    <template #links>
      <UButton
        to="/storelanding"
        size="lg"
        class="bg-[#097D4C] hover:bg-[#08643d] text-white"
      >
        List Your Store for Free
      </UButton>
    </template>
  </ULandingCTA>
</template>
