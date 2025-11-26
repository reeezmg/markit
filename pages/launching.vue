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
  { label: 'List Your Shop', icon: 'i-heroicons-building-storefront', to: '/getting-started',size:'lg' },
  { label: 'Login', icon: 'i-heroicons-arrow-right-on-rectangle', to: '/getting-started',size:'lg' },
  { label: 'Register', icon: 'i-heroicons-user-plus', to: '/getting-started',size:'lg' },
]




</script>

<template>
  <div class="bg-[#F8FDF3] ">
    <UHeader
      title="Markit"
      class="mb-10 text-[#097D4C]"
      :ui = "{
        title: 'text-[#097D4C]',
      }"
    >
      <template #logo>
        <img
          src="/icons/logo.png"
          class="w-auto h-10"
        />  
      </template>
      <template #right>
       <div class="hidden lg:flex">
        <UButton
          to="/storelanding"
          class="bg-[#097D4C] text-white hover:bg-[#08643d] me-1"
        >
          List Your Shop
        </UButton>
        <UButton
          to="/launching"
          class="bg-[#097D4C] text-white hover:bg-[#08643d] me-1"
        >
          Login
        </UButton>
        <UButton
          to="/launching"
          class="bg-[#097D4C] text-white hover:bg-[#08643d]"
        >
          Register
        </UButton>
      </div>

      </template>

      <template #panel>
      <UNavigationTree :links="navLinks" />
    </template>

    </UHeader>

   <ULandingHero
      title="Launching soon."
      description="The way you shop locally is about to change."
      :ui="{ 
        wrapper: '',
        title: 'text-5xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-7xl text-[#097D4C]',
        description: 'mt-6 text-lg tracking-tight text-gray-600 dark:text-gray-300 text-[#097D4C]',
        links: 'mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3'
      }"
    >
      <template #top>
        <div class="flex justify-center">
          <img src="/icons/logo.png" class="w-auto h-20" />
        </div>
      </template>
    </ULandingHero>

    <img
      src="/images/hero.png"
      class="w-full object-contain z-0
             md:-mt-[100px] lg:-mt-[1700px] xl:-mt-[170px]"
    />

   

<UDivider />
<UContainer>
  <UFooter >
    <template #left>
      Copyright © {{ new Date().getFullYear() }}
    </template>

    <template #right>
      <UButton icon="i-simple-icons-x" color="gray" variant="ghost" to="https://x.com/nuxt_js" target="_blank" />
      <UButton icon="i-simple-icons-instagram" color="gray" variant="ghost" to="https://discord.com/invite/ps2h6QT" target="_blank" />
      <UButton icon="i-simple-icons-whatsapp" color="gray" variant="ghost" to="https://github.com/nuxt/nuxt" target="_blank" />
    </template>
  </UFooter>
</UContainer>


  </div>
</template>
