<script setup lang="ts">
import { ArrowRight, ArrowUpRight } from 'lucide-vue-next'
import { commerceArticles } from '~/data/commerce-articles'
definePageMeta({ layout: 'brand', colorMode: 'light', auth: false })
const title = 'The Commerce Edit — AI Ecommerce, SEO & Retail Guides | Markit'
const description =
  'Practical guides for building your ecommerce brand with AI, creating custom plugins and agents, and connecting your storefront to retail operations.'
useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogImage: 'https://markit.co.in/images/marketing/commerce-studio.webp',
  twitterCard: 'summary_large_image',
})
useHead({ link: [{ rel: 'canonical', href: 'https://markit.co.in/blogs' }] })
</script>
<template>
  <main id="main-content" class="section-wrap blog-index">
    <header class="blog-heading center-heading">
      <div class="eyebrow">THE COMMERCE EDIT / BY MARKIT</div>
      <h1>For your next<br /><span>“what if?”</span></h1>
      <p>
        Fresh ideas. Practical guides. A little encouragement to build the brand you can’t stop
        thinking about.
      </p>
    </header>
    <div class="journal-grid">
      <NuxtLink
        v-for="article in commerceArticles"
        :key="article.slug"
        :to="`/blogs/${article.slug}`"
        class="journal-card"
        ><div class="journal-art" :class="article.color">
          <span>{{ article.art }}</span
          ><ArrowUpRight :size="25" />
        </div>
        <div class="card-tag">{{ article.category }} · {{ article.readTime }} MIN READ</div>
        <h2 style="font-size: 25px; letter-spacing: -0.8px; margin: 12px 0">{{ article.title }}</h2>
        <p>{{ article.description }}</p>
        <span class="text-link">Read the story <ArrowRight :size="15" /></span
      ></NuxtLink>
    </div>
  </main>
</template>
