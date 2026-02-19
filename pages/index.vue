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
  colorMode: 'light',
})

const navLinks = [
  { label: 'List Your Store', icon: 'i-heroicons-building-storefront', to: '/storelanding',size:'lg' },
  { label: 'Start Shopping', icon: 'i-heroicons-arrow-right-on-rectangle', to: '/store.markit.co.in',size:'lg' },
]

const features = [
  {
    title: 'Try at Home',
    description: 'Pick multiple items, try them in comfort, pay only for what you love.',
    align: 'right',
    image: 'try.png'
  },
  {
    title: 'Book Now, Pay Later',
    description: 'Reserve your picks and pay when they arrive.',
    align: 'left',
    image: 'book.png'
  },
  {
    title: 'Instant Delivery',
    description: 'Get items delivered to your door within 60 minutes.',
    align: 'right',
    image: 'instant.png'
  },
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
          Your store
        </UButton>
        <UButton
        to="https://store.markit.co.in"
          class="bg-[#097D4C] text-white hover:bg-[#08643d] me-1"
        >
          Try N Buy
        </UButton>
        
      </div>

      </template>

      <template #panel>
      <UNavigationTree :links="navLinks" />
    </template>

    </UHeader>
    
    

   <ULandingHero
      title="Shop Smarter. Try Before You Buy."
      description="Buy products from trusted local retailers with flexible delivery options — Try-at-home, Book now, or Instant delivery. All powered by Markit."
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
             md:-mt-[50px] lg:-mt-[100px] xl:-mt-[100px]"
    />

   

      <ULandingSection
        v-for="(feature, index) in features"
        :key="index"
        :title="feature.title"
        :description="feature.description"
        :align="feature.align"
        :ui="{
          wrapper: 'py-24 sm:py-10',
          title: 'text-[#097D4C]',
          description: 'text-[#097D4C]'
        }"
      >

           <img
              :src="`/images/${feature.image}`"
        
            />
      </ULandingSection>
    

   <UContainer >
    <UDivider class="py-16" />
      <ULandingLogos title="" align="center">
        <img src="/images/apparelIcon.png" class="w-28 h-28 object-contain" />
        <img src="/images/shoeIcon.png" class="w-28 h-28 object-contain" />
        <img src="/images/fancyIcon.png" class="w-28 h-28 object-contain" />
        <img src="/images/trendingIcon.png" class="w-28 h-28 object-contain" />
      </ULandingLogos>
      <UDivider class="py-20" />
    </UContainer>

      <UContainer class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-shopping-cart" color="green"/>
              </div>
              <h3 class="text-xl font-semibold">Convenient Shopping.</h3>
              <p class="text-gray-600 mt-2">
                Skip the traffic. Try at home. No pressure. Along with Multiple Purchase Option.
              </p>
            </UCard>

            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-building-storefront" color="green" />
              </div>
              <h3 class="text-xl font-semibold">Local First</h3>
              <p class="text-gray-600 mt-2">
                Buy from verified, nearby shops you already trust. This ensures better product quality, Faster delivery and supports your local economy.
              </p>
            </UCard>

            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-banknotes" color="green"/>
              </div>
              <h3 class="text-xl font-semibold">No Clickbait Offers</h3>
              <p class="text-gray-600 mt-2">
                Genuine discounts on real prices, not fake offers on inflated MRP. No tricks, just transparent deals.
              </p>
            </UCard>
    </UContainer>

    
<UContainer>
  <UDivider class="py-20" />
  <ULandingCTA
    title="Shopping has changed"
    description="Try the Markit way."
    :card="false"
    :links="[{ label: 'Explore Shops Near You', color:'green',to: '/launching', size: 'sm',class:'bg-[#097D4C]' }]"
  />
<UDivider class="" />
</UContainer>

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
