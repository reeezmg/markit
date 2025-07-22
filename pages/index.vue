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
});
</script>

<template>
  <div>
    <!-- Hero Section -->
    <UPageHero
      :title="title"
      :description="description"
      align="center"
      :links="[
        { label: 'Explore Stores', to: '/stores', color: 'primary' },
        { label: 'How It Works', to: '#how-it-works' }
      ]"
    >
      <template #top>
        <div class="absolute size-96 -translate-x-1/2 left-1/2 -translate-y-72 blur-[300px] bg-primary/30 dark:bg-primary/40 rounded-full" />
        <LazyStarsBg />
      </template>
    </UPageHero>

    <!-- How it Works -->
    <UPageSection id="how-it-works" title="How Markit Works for Shoppers" description="A smooth and modern way to shop from local stores.">
      <UPageGrid>
        <UPageCard
          icon="search"
          title="Browse Local Retailers"
          description="Discover trusted fashion and lifestyle stores in your city."
        />
        <UPageCard
          icon="shopping-bag"
          title="Choose Your Delivery Style"
          description="Try at home, book without payment, or get same-day delivery."
        />
        <UPageCard
          icon="thumbs-up"
          title="Keep What You Love"
          description="Only pay for what you keep. Returns are picked up by the delivery agent."
        />
      </UPageGrid>
    </UPageSection>

    <!-- Features / Benefits -->
    <UPageSection title="Why Shoppers Love Markit" description="We make online shopping feel like an in-store experience.">
      <UPageGrid>
        <UPageCard title="Try-at-Home Experience" icon="home" description="Select multiple items and try them comfortably before purchasing." />
        <UPageCard title="Local & Instant Delivery" icon="clock" description="Same-day doorstep delivery from nearby shops." />
        <UPageCard title="Easy Returns" icon="rotate-ccw" description="Return what you don't want — no hassle, no questions." />
        <UPageCard title="Verified Retailers Only" icon="shield-check" description="Every seller is trusted, vetted, and service-focused." />
      </UPageGrid>
    </UPageSection>

    <!-- Featured Stores (Example section) -->
    <UPageSection title="Featured Stores Near You">
      <UPageGrid>
        <UPageCard
          v-for="(store, i) in [1, 2, 3]"
          :key="i"
          title="Westend Apparel"
          description="Trendy menswear from your neighborhood. Try at home now."
          to="/store/westend-apparel"
        />
      </UPageGrid>
    </UPageSection>

    <!-- Call to Action -->
    <UPageCTA
      title="Shop from Trusted Local Retailers"
      description="Get started with Markit and make your shopping experience personal, local, and flexible."
      :links="[
        { label: 'Start Shopping', to: '/stores', color: 'primary' },
        { label: 'Learn More', to: '/about' }
      ]"
      class="overflow-hidden"
      variant="naked"
    >
      <div class="absolute size-40 sm:size-52 blur-[250px] bg-primary/30 dark:bg-primary/40 -translate-x-1/2 left-1/2 -translate-y-80 rounded-full" />
      <LazyStarsBg />
    </UPageCTA>
  </div>
</template>
