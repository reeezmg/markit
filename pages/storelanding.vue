<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Markit">
        <template #right>
          <div class="flex items-center gap-4">
            <UButton color="primary" to="/login">Login</UButton>
            <UButton color="primary" to="/register">Register</UButton>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <UContainer class="py-20 space-y-24">
          <!-- Hero Section -->
          <UCard class="text-center space-y-6 shadow-xl">
            <template #header>
              <h1 class="text-4xl md:text-5xl font-bold text-primary">
                Software for Fashion & Lifestyle Retailers
              </h1>
            </template>
            <p class="text-gray-600 text-lg max-w-2xl mx-auto">
              Empower your business with a platform built for inventory, billing, CRM, and hybrid shopping models like Try-at-Home and Book Online, Try in Store.
            </p>
            <UButton class="my-3" size="lg" color="primary" to="/register">
              Get Started for Free
            </UButton>
          </UCard>

          <!-- Features Section -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-archive-box" />
              </div>
              <h3 class="text-xl font-semibold">Inventory Management</h3>
              <p class="text-gray-600 mt-2">
                Real-time inventory tracking with automatic updates for online, offline, and trial bookings.
              </p>
            </UCard>

            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-user-group" />
              </div>
              <h3 class="text-xl font-semibold">Client Relationship Management (CRM)</h3>
              <p class="text-gray-600 mt-2">
                Track customer and retailer relationships with insights, order history, and messaging support.
              </p>
            </UCard>

            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-banknotes" />
              </div>
              <h3 class="text-xl font-semibold">ERP, Billing & Accounting</h3>
              <p class="text-gray-600 mt-2">
                Generate GST-compliant bills, log sales across outlets, and manage online + offline transactions.
              </p>
            </UCard>

            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-shopping-cart" />
              </div>
              <h3 class="text-xl font-semibold">Try-at-Home & Try in Store</h3>
              <p class="text-gray-600 mt-2">
                Reduce returns and boost satisfaction by letting customers try products before buying — at home or in-store.
              </p>
            </UCard>

            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-building-storefront" />
              </div>
              <h3 class="text-xl font-semibold">Wholesaler Marketplace</h3>
              <p class="text-gray-600 mt-2">
                Retailers can discover and order from trusted wholesalers on a built-in B2B marketplace with role-based access.
              </p>
            </UCard>

            <UCard class="text-center py-8 px-6">
              <div class="text-4xl text-primary mb-4">
                <UIcon name="i-heroicons-chart-bar" />
              </div>
              <h3 class="text-xl font-semibold">Sales & Performance Reports</h3>
              <p class="text-gray-600 mt-2">
                Track product performance, return trends, user sales, and booking outcomes with insightful dashboards.
              </p>
            </UCard>
          </div>
        </UContainer>

        <UContainer>
          <!-- Pricing Section -->
          <div class="text-center space-y-4">
            <h2 class="text-3xl font-bold">Markit Pricing</h2>
            <p class="text-gray-600">Pricing plans that grow with you.</p>

            <!-- Toggle -->
            <div class="flex justify-center my-4">
              <UPricingToggle v-model="isYearly" class="max-w-xs" />
            </div>

            <!-- Pricing Cards -->
            <UPricingGrid :compact="false">
              <UPricingCard
                v-for="(plan, index) in pricingPlans"
                :key="index"
                :title="plan.title"
                :description="plan.description"
                :price="plan.price"
                :highlight="plan.highlight"
              >
                <template #features>
                  <ul class="text-left space-y-2 px-6">
                    <li
                      v-for="feature in plan.features"
                      :key="feature.label"
                      class="flex items-center gap-2"
                    >
                      <UIcon
                        :name="feature.available ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                        :class="feature.available ? 'text-green-500' : 'text-red-400'"
                      />
                      <span :class="feature.available ? '' : 'line-through text-gray-400'">
                        {{ feature.label }}
                      </span>
                    </li>
                  </ul>
                </template>

                <template #footer>
                  <UButton
                    :to="`/register?plan=${encodeURIComponent(plan.title.toLowerCase())}`"
                    block
                    color="primary"
                    class="mt-4"
                  >
                    List Your Store
                  </UButton>
                  <p class="text-sm text-gray-500 mt-2 text-center">
                    {{ plan.refundNote }}
                  </p>
                </template>
              </UPricingCard>
            </UPricingGrid>
          </div>
        </UContainer>

        <!-- TERMS LINK -->
        <UContainer class="py-10 text-center">
          <UDivider class="mb-6" />
          <p class="text-gray-600">
            By continuing, you agree to our
            <NuxtLink to="/terms" class="text-[#097D4C] font-semibold underline">
              Terms of Service & Privacy Policy
            </NuxtLink>
          </p>
        </UContainer>

      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>

<script setup>
definePageMeta({
  layout: false,
})

const isYearly = ref(false)

const pricingPlans = computed(() => [
  {
    title: 'Free',
    description: 'List Your store for free',
    price: isYearly.value ? '₹0/year' : '₹0/month',
    features: [
      { label: '50 Products', available: true },
      { label: '1 User', available: true },
      { label: 'Billing', available: false },
      { label: 'Accounts', available: false },
      { label: 'Purchase Order', available: false },
      { label: 'Reports', available: true },
      { label: 'Product Management', available: true },
      { label: 'Order Management', available: true },
      { label: 'User Management', available: true },
      { label: 'Client Management', available: true },
      { label: 'Shop E-Commerce', available: true },
      { label: 'Cataloging assistance', available: false },
    ],
    highlight: false,
    refundNote: 'Refundable within 28 days.'
  },
  {
    title: 'Lite',
    description: 'List Your store Without ERP',
    price: isYearly.value ? '₹10,000/year' : '₹1,000/month',
    features: [
      { label: 'unlimited Products', available: true },
      { label: 'unlimited User', available: true },
      { label: 'Billing', available: false },
      { label: 'Accounts', available: false },
      { label: 'Purchase Order', available: false },
      { label: 'Reports', available: true },
      { label: 'Product Management', available: true },
      { label: 'Order Management', available: true },
      { label: 'User Management', available: true },
      { label: 'Client Management', available: true },
      { label: 'Shop E-Commerce', available: true },
      { label: '300 Cataloging Assitance', available: true },
    ],
    highlight: true,
    refundNote: 'Refundable within 28 days.'
  },
  {
    title: 'Pro',
    description: 'List Your store With ERP',
    price: isYearly.value ? '₹20,000/year' : '₹2,000/month',
    features: [
      { label: 'unlimited Products', available: true },
      { label: 'unlimited User', available: true },
      { label: 'Billing', available: true },
      { label: 'Accounts', available: true },
      { label: 'Purchase Order', available: true },
      { label: 'Reports', available: true },
      { label: 'Product Management', available: true },
      { label: 'Order Management', available: true },
      { label: 'User Management', available: true },
      { label: 'Client Management', available: true },
      { label: 'Shop E-Commerce', available: true },
      { label: '300 Cataloging Assitance', available: true },
    ],
    highlight: false,
    refundNote: 'Refundable within 28 days.'
  }
])
</script>

<style scoped>
</style>