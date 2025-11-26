<template>
  <UContainer class="space-y-16 py-16">
    <!-- Header -->
    <section class="text-center max-w-3xl mx-auto space-y-4">
      <h1 class="text-4xl font-bold text-green-800">Revolutionizing Local Shopping with Try Before You Buy</h1>
      <p class="text-lg text-muted-foreground">
        Markit's delivery-first model lets customers try fashion and lifestyle items at home before buying.
        Discover how it works for both buyers and local stores.
      </p>
    </section>

    <!-- How it Works -->
    <UCard>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 text-center p-6">
        <div>
          <UIcon name="i-heroicons-plus-circle" class="text-green-800 text-4xl mb-2" />
          <h3 class="text-lg font-semibold">1. Browse Products</h3>
          <p class="text-muted-foreground">Select styles you like from local shops listed on Markit.</p>
        </div>
        <div>
          <UIcon name="i-heroicons-currency-rupee" class="text-green-800 text-4xl mb-2" />
          <h3 class="text-lg font-semibold">2. Pay Delivery Fee</h3>
          <p class="text-muted-foreground">Pay a flat delivery fee — no product cost yet.</p>
        </div>
        <div>
          <UIcon name="i-heroicons-home-modern" class="text-green-800 text-4xl mb-2" />
          <h3 class="text-lg font-semibold">3. Try at Home</h3>
          <p class="text-muted-foreground">Our delivery partner brings all items within an hour.</p>
        </div>
        <div>
          <UIcon name="i-heroicons-check-badge" class="text-green-800 text-4xl mb-2" />
          <h3 class="text-lg font-semibold">4. Keep or Return</h3>
          <p class="text-muted-foreground">Keep what you love, pay on the spot — return the rest easily.</p>
        </div>
      </div>
    </UCard>

    <!-- Why Customers Love It -->
   <UCard class="max-w-4xl mx-auto">
  <div class="p-6 space-y-12">
    <!-- Why Customers Love It -->
    <section class="space-y-4">
      <h2 class="text-2xl font-semibold text-green-800 text-center">Why Customers Love It</h2>
      <ul class="list-disc list-inside text-muted-foreground">
        <li>No upfront product payment</li>
        <li>Try multiple styles at home</li>
        <li>Instant delivery experience</li>
        <li>No return hassles</li>
        <li>Perfect for apparel, footwear, and lifestyle items</li>
      </ul>
    </section>

    <!-- Why Stores Choose Markit -->
    <section class="space-y-4">
      <h2 class="text-2xl font-semibold text-green-800 text-center">Why Stores Choose Markit</h2>
      <ul class="list-disc list-inside text-muted-foreground">
        <li>Convert more by offering trials</li>
        <li>Tap into a local customer base</li>
        <li>Digital storefront with no coding</li>
        <li>Live inventory & instant orders</li>
        <li>Logistics & return management handled by us</li>
      </ul>
    </section>
  </div>
</UCard>



    <!-- Testimonial -->
    <UCard class="border-l-4 border-green-800 bg-muted max-w-3xl mx-auto">
      <div class="p-6">
        <blockquote class="italic text-lg text-foreground">
          “One of our customers tried 6 pairs of sandals at home, kept 2 — and returned the rest within minutes.
          We closed the sale instantly. This was impossible before Markit.”
        </blockquote>
        <footer class="mt-3 text-sm text-muted-foreground text-right">— Paduka, Mangalore</footer>
      </div>
    </UCard>

    <!-- CTA -->
    <BlogCTAStoreCTA/>
  </UContainer>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Markit Try Before You Buy Delivery Model | Experience Shopping at Home',
  description: 'Explore how Markit enables customers to try products before buying through our innovative Try Before You Buy delivery model, revolutionizing local shopping.',
  ogTitle: 'Try Before You Buy with Markit',
  ogDescription: 'Markit’s Try Before You Buy model lets customers experience local shopping like never before — try products at home, buy only what you love.',
})
</script>
