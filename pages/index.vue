<script setup lang="ts">
const title = 'Shop Smarter. Try Before You Buy.'
const description = 'Buy products from trusted local retailers with flexible delivery options — Try-at-home, Book now, or Instant delivery. All powered by Markit.'

useSeoMeta({
  title,
  ogTitle: title,
  description,
  ogDescription: description
})

definePageMeta({
  layout: false,
})

const navLinks = [
  { label: 'Docs', icon: 'i-heroicons-book-open', to: '/getting-started' },
  { label: 'Pro', icon: 'i-heroicons-square-3-stack-3d', to: '/pro' },
  { label: 'Releases', icon: 'i-heroicons-rocket-launch', to: '/releases' }
]

const heroLinks = [
  { label: 'Get Started', icon: 'i-heroicons-rocket-launch', size: 'lg' },
  { label: 'Learn more', 'trailing-icon': 'i-heroicons-arrow-small-right', color: 'gray', size: 'lg' }
]

const features = [
  {
    title: 'Try at Home',
    description: 'Pick multiple items, try them in comfort, pay only for what you love.',
    reverse: false
  },
  {
    title: 'Book Now, Pay Later',
    description: 'Reserve your picks and pay when they arrive.',
    reverse: true
  },
  {
    title: 'Instant Delivery',
    description: 'Get items delivered to your door within 60 minutes.',
    reverse: false
  },
  {
    title: 'Seamless Returns',
    description: 'Return what you don’t need, hassle-free at pickup time.',
    reverse: true
  }
]

</script>

<template>
  <div>
    <!-- Nuxt UI Pro Header -->
    <UHeader
      title="Markit"
      :links="navLinks"
    />

    <!-- Hero Section -->
    <ULandingHero
      title="Shop Smarter. Try Before You Buy."
      description="Buy products from trusted local retailers with flexible delivery options — Try-at-home, Book now, or Instant delivery. All powered by Markit."
      :links="heroLinks"
    />

    <img
  src="~/assets/images/hero.png"
  class="-mt-[235px] w-full  object-contain z-0"
/>
  </div>
  <div class="">
    <ULandingSection
      v-for="(feature, index) in features"
      :key="index"
      :title="feature.title"
      :description="feature.description"
      :ui="{ wrapper: 'max-w-7xl mx-auto px-6 sm:py-2y', container: feature.reverse ? 'flex flex-col-reverse md:flex-row-reverse items-center gap-10' : 'flex flex-col-reverse md:flex-row items-center gap-10' }"
    >
      <!-- Image or icon placeholder -->
      <div class="w-full md:w-1/2 bg-gray-100 h-48 md:h-64 rounded-xl flex items-center justify-center">
        <div class="bg-gray-300 w-20 h-20 rounded-full" />
      </div>
    </ULandingSection>
  </div>
</template>
