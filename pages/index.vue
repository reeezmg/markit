<template>
    <UDashboardPanelContent>
    <UContainer class="py-20 space-y-24">
      <!-- Hero Section -->
      <UCard class="text-center space-y-6 shadow-xl">
        <template #header>
          <h1 class="text-4xl md:text-5xl font-bold text-primary">Smart SaaS for Indian SMEs</h1>
        </template>
        <p class="text-gray-600 text-lg max-w-2xl mx-auto">
          Empower your retail or wholesale business with a platform built for inventory, billing, CRM, B2B marketplace, and hybrid shopping models like Try-at-Home and Book Online, Try in Store.
        </p>
        <UButton size="lg" color="primary" to="/register">Get Started for Free</UButton>
      </UCard>
  
      <!-- Features Section -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        <UCard class="text-center py-8 px-6">
          <div class="text-4xl text-primary mb-4">
            <UIcon name="i-heroicons-archive-box" />
          </div>
          <h3 class="text-xl font-semibold">Inventory Management</h3>
          <p class="text-gray-600 mt-2">Real-time inventory tracking with automatic updates for online, offline, and trial bookings.</p>
        </UCard>
  
        <UCard class="text-center py-8 px-6">
          <div class="text-4xl text-primary mb-4">
            <UIcon name="i-heroicons-user-group" />
          </div>
          <h3 class="text-xl font-semibold">Client Relationship Management (CRM)</h3>
          <p class="text-gray-600 mt-2">Track customer and retailer relationships with insights, order history, and messaging support.</p>
        </UCard>
  
        <UCard class="text-center py-8 px-6">
          <div class="text-4xl text-primary mb-4">
            <UIcon name="i-heroicons-banknotes" />
          </div>
          <h3 class="text-xl font-semibold">ERP, Billing & Accounting</h3>
          <p class="text-gray-600 mt-2">Generate GST-compliant bills, log sales across outlets, and manage online + offline transactions.</p>
        </UCard>
  
        <UCard class="text-center py-8 px-6">
          <div class="text-4xl text-primary mb-4">
            <UIcon name="i-heroicons-shopping-cart" />
          </div>
          <h3 class="text-xl font-semibold">Try-at-Home & Try in Store</h3>
          <p class="text-gray-600 mt-2">Reduce returns and boost satisfaction by letting customers try products before buying — at home or in-store.</p>
        </UCard>
  
        <UCard class="text-center py-8 px-6">
          <div class="text-4xl text-primary mb-4">
            <UIcon name="i-heroicons-building-storefront" />
          </div>
          <h3 class="text-xl font-semibold">Wholesaler Marketplace</h3>
          <p class="text-gray-600 mt-2">Retailers can discover and order from trusted wholesalers on a built-in B2B marketplace with role-based access.</p>
        </UCard>
  
        <UCard class="text-center py-8 px-6">
          <div class="text-4xl text-primary mb-4">
            <UIcon name="i-heroicons-chart-bar" />
          </div>
          <h3 class="text-xl font-semibold">Sales & Performance Analytics</h3>
          <p class="text-gray-600 mt-2">Track product performance, return trends, and booking outcomes with insightful dashboards.</p>
        </UCard>
      </div>
  
      <!-- Call to Action -->
      <div class="text-center space-y-4">
        <h2 class="text-3xl font-bold">Start Your 14-Day Free Trial</h2>
        <p class="text-gray-600">Built for Indian SMEs. No credit card required. Cancel anytime.</p>
        <UButton size="lg" color="primary" to="/register">Launch Your Store</UButton>
      </div>
    </UContainer>
</UDashboardPanelContent>
  </template>
  
  <script setup>
 definePageMeta({
    layout: false,
});
  </script>
  
  <style scoped>
  </style>
  