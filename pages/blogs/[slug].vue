<script setup lang="ts">
import { ArrowUpRight } from 'lucide-vue-next'
import { commerceArticles } from '~/data/commerce-articles'
definePageMeta({ layout: 'brand', colorMode: 'light', auth: false })
const route = useRoute()
const article = computed(() => commerceArticles.find((item) => item.slug === route.params.slug))
if (!article.value) throw createError({ statusCode: 404, statusMessage: 'Article not found' })
const url = computed(() => `https://markit.co.in/blogs/${article.value?.slug}`)
useSeoMeta({
  title: () => `${article.value?.title} | Markit`,
  description: () => article.value?.description,
  ogTitle: () => article.value?.title,
  ogDescription: () => article.value?.description,
  ogType: 'article',
  ogUrl: () => url.value,
  ogImage: 'https://markit.co.in/images/marketing/commerce-studio.webp',
  twitterCard: 'summary_large_image',
})
useHead(() => ({
  link: [{ rel: 'canonical', href: url.value }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BlogPosting',
            headline: article.value?.title,
            description: article.value?.description,
            mainEntityOfPage: url.value,
            image: 'https://markit.co.in/images/marketing/commerce-studio.webp',
            author: { '@type': 'Organization', name: 'Markit', url: 'https://markit.co.in/' },
            publisher: { '@type': 'Organization', name: 'Markit', url: 'https://markit.co.in/' },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://markit.co.in/' },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'The Commerce Edit',
                item: 'https://markit.co.in/blogs',
              },
              { '@type': 'ListItem', position: 3, name: article.value?.title, item: url.value },
            ],
          },
        ],
      }).replace(/</g, '\\u003c'),
    },
  ],
}))
</script>
<template>
  <main v-if="article" id="main-content" class="article-wrap">
    <NuxtLink to="/blogs" class="text-link">← Back to the commerce edit</NuxtLink>
    <article>
      <header>
        <div class="article-meta">
          <span>{{ article.category }}</span
          ><span>{{ article.readTime }} min read</span><span>By Markit</span>
        </div>
        <h1>{{ article.title }}</h1>
        <p class="article-lead">{{ article.description }}</p>
        <div class="journal-art" :class="article.color">
          <span>{{ article.art }}</span
          ><ArrowUpRight :size="30" />
        </div>
      </header>
      <nav class="article-toc" aria-label="In this article">
        <strong>IN THIS ARTICLE</strong
        ><a
          v-for="(section, index) in article.sections"
          :key="section.heading"
          :href="`#section-${index + 1}`"
          >{{ section.heading }}</a
        >
      </nav>
      <section
        v-for="(section, index) in article.sections"
        :id="`section-${index + 1}`"
        :key="section.heading"
        class="article-section"
      >
        <h2>{{ section.heading }}</h2>
        <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
      </section>
      <p v-if="article.source" class="article-meta">
        Source:
        <a
          :href="article.source.url"
          target="_blank"
          rel="noopener noreferrer"
          style="text-decoration: underline"
          >{{ article.source.title }}</a
        >
      </p>
      <aside class="article-callout">
        <h2>Your next idea deserves a storefront.</h2>
        <p>
          Build your brand with AI, preview the details and bring your business together with
          Markit.
        </p>
        <NuxtLink to="/register" class="button button-orange"
          >Start building <ArrowUpRight :size="16"
        /></NuxtLink>
      </aside>
    </article>
    <nav class="related-links" aria-label="Related articles">
      <strong>KEEP EXPLORING</strong
      ><NuxtLink
        v-for="related in commerceArticles
          .filter((item) => item.slug !== article?.slug)
          .slice(0, 3)"
        :key="related.slug"
        :to="`/blogs/${related.slug}`"
        >{{ related.title }} ↗</NuxtLink
      >
    </nav>
  </main>
</template>
