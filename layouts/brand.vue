<script setup lang="ts">
import { ArrowUpRight, Menu, X, Sparkles } from 'lucide-vue-next'
import '~/assets/css/brand.css'
import '~/assets/css/brand-motion.css'
const menuOpen = ref(false)
const route = useRoute()
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  }
)
</script>
<template>
  <div class="brand-site">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <div class="announcement">
      <Sparkles :size="13" /> Big ideas. Meet your unfair advantage.
      <NuxtLink to="/#acommerce">Meet A-commerce ↗</NuxtLink>
    </div>
    <header class="brand-header">
      <NuxtLink to="/" class="wordmark" aria-label="Markit home"
        ><span class="brand-symbol" aria-hidden="true">m</span>markit<span class="wordmark-dot"
          >.</span
        ></NuxtLink
      >
      <nav class="desktop-nav" aria-label="Main navigation">
        <NuxtLink to="/#acommerce">A-commerce</NuxtLink><NuxtLink to="/#build">Storefront</NuxtLink
        ><NuxtLink to="/#operations">ERP & operations</NuxtLink
        ><NuxtLink to="/#pricing">Pricing</NuxtLink>
      </nav>
      <div class="header-actions">
        <NuxtLink class="login-link" to="/login">Log in</NuxtLink
        ><NuxtLink class="button button-dark button-small" to="/register"
          >Start building <ArrowUpRight :size="15" /></NuxtLink
        ><button
          class="menu-toggle"
          :aria-expanded="menuOpen"
          aria-controls="mobile-menu"
          :aria-label="menuOpen ? 'Close navigation' : 'Open navigation'"
          @click="menuOpen = !menuOpen"
        >
          <X v-if="menuOpen" /><Menu v-else />
        </button>
      </div>
      <nav
        v-if="menuOpen"
        id="mobile-menu"
        class="mobile-nav"
        aria-label="Mobile navigation"
        @click="menuOpen = false"
        @keydown.esc="menuOpen = false"
      >
        <NuxtLink to="/#acommerce">A-commerce</NuxtLink><NuxtLink to="/#build">Storefront</NuxtLink
        ><NuxtLink to="/#ai">AI studio</NuxtLink
        ><NuxtLink to="/#operations">ERP & operations</NuxtLink
        ><NuxtLink to="/#pricing">Pricing</NuxtLink><NuxtLink to="/login">Log in</NuxtLink>
      </nav>
    </header>
    <slot />
    <footer class="brand-footer">
      <div class="footer-top">
        <div>
          <NuxtLink to="/" class="wordmark">markit<span class="wordmark-dot">.</span></NuxtLink>
          <p>Big shop energy.<br />Built your way.</p>
        </div>
        <div>
          <span>MAKE IT YOURS</span><NuxtLink to="/#acommerce">What is A-commerce?</NuxtLink
          ><NuxtLink to="/#build">AI storefront builder</NuxtLink
          ><NuxtLink to="/#operations">Retail ERP</NuxtLink
          ><NuxtLink to="/#pricing">Plans & pricing</NuxtLink>
        </div>
        <div>
          <span>GET IN TOUCH</span><a href="mailto:reez@markit.co.in">Let’s talk</a
          ><NuxtLink to="/terms">Terms & privacy</NuxtLink>
        </div>
        <div class="footer-note">
          For the dreamers.<br />The doers.<br /><em>The next big thing.</em>
          <Sparkles :size="28" />
        </div>
      </div>
      <div class="footer-bottom">
        <span>© {{ new Date().getFullYear() }} Flobit Technologies Private Limited.</span
        ><span>Made for a world of original brands. ↗</span>
      </div>
    </footer>
  </div>
</template>
