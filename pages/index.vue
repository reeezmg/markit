<script setup lang="ts">
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDownRight,
  Sparkles,
  Check,
  Plus,
  Minus,
  Package,
  ScanLine,
  Users,
  BarChart3,
  WandSparkles,
  Image,
  Search,
  Blocks,
  Bot,
  ShoppingBag,
  Send,
  CheckCheck,
} from 'lucide-vue-next'
import { marketingFaqs, marketingPlans, planFeatures } from '~/data/marketing'
import { onMounted, onBeforeUnmount } from 'vue'
import StorefrontDemo from '~/components/Marketing/StorefrontDemo.vue'
definePageMeta({ layout: 'brand', colorMode: 'light', auth: false })
const yearly = ref(false)
const landingRoot = ref<HTMLElement | null>(null)
let disposeMotion: (() => void) | undefined
onMounted(() => {
  const root = landingRoot.value
  if (!root || !('IntersectionObserver' in window)) return
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  const animations = new Set<Animation>()
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        if (preference.matches || typeof entry.target.animate !== 'function') continue
        const animation = entry.target.animate(
          [
            { opacity: 0.35, translate: '0 20px' },
            { opacity: 1, translate: '0 0' },
          ],
          { duration: 620, easing: 'cubic-bezier(.2,.7,.2,1)' }
        )
        animations.add(animation)
        animation.onfinish = () => {
          animations.delete(animation)
        }
      }
    },
    { threshold: 0.12 }
  )
  root
    .querySelectorAll(
      '.section-heading, .acommerce-card, .ai-card, .plugin-card, .agent-card, .erp-preview, .price-card, .faq-section > div'
    )
    .forEach((element) => {
      if (element.getBoundingClientRect().top > window.innerHeight) observer.observe(element)
    })
  const cancelMotion = () => {
    if (!preference.matches) return
    animations.forEach((animation) => animation.cancel())
    animations.clear()
  }
  preference.addEventListener('change', cancelMotion)
  disposeMotion = () => {
    observer.disconnect()
    animations.forEach((animation) => animation.cancel())
    preference.removeEventListener('change', cancelMotion)
  }
})
onBeforeUnmount(() => disposeMotion?.())
const aiFeatures = [
  {
    icon: WandSparkles,
    title: 'Words with your personality.',
    text: 'Product stories, collection pages, emails and blogs. Go from blank page to on-brand first draft.',
    tag: 'CONTENT THAT CONNECTS',
    class: 'peach',
  },
  {
    icon: Image,
    title: 'A whole creative studio.',
    text: 'Generate campaign visuals, edit product images and explore a fresh art direction for your next drop.',
    tag: 'MAKE A LITTLE SCENE',
    class: 'lilac',
  },
  {
    icon: Search,
    title: 'Give discovery a head start.',
    text: 'Create useful buying guides, sharpen metadata and write clear answers to your customers’ questions.',
    tag: 'SEO, WITH SUBSTANCE',
    class: 'lime',
  },
]
const operations = [
  {
    icon: Package,
    title: 'Products & inventory',
    text: 'Products, variants, stock and purchase orders. Keep your catalogue and your back room organised.',
  },
  {
    icon: ScanLine,
    title: 'POS & billing',
    text: 'From the counter to sales history. Create bills, handle returns and track everyday retail sales.',
  },
  {
    icon: Users,
    title: 'Customers & CRM',
    text: 'Keep customer relationships, sales pipelines and order context close to your team.',
  },
  {
    icon: BarChart3,
    title: 'Accounts & insights',
    text: 'Follow expenses, cash and bank activity, and sales reports to understand your business.',
  },
]
const title = 'Markit — A-Commerce, AI Storefront Builder & Retail ERP'
const description =
  'Meet A-commerce with Markit: agentic commerce for building your store with AI. Create content, custom features and agents, review changes, and run your retail ERP.'
useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: 'https://markit.co.in/',
  ogImage: 'https://markit.co.in/images/marketing/commerce-studio.webp',
  twitterCard: 'summary_large_image',
  twitterImage: 'https://markit.co.in/images/marketing/commerce-studio.webp',
})
useHead({
  link: [{ rel: 'canonical', href: 'https://markit.co.in/' }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': 'https://markit.co.in/#organization',
            name: 'Markit',
            url: 'https://markit.co.in/',
          },
          {
            '@type': 'WebSite',
            name: 'Markit',
            url: 'https://markit.co.in/',
            publisher: { '@id': 'https://markit.co.in/#organization' },
          },
          {
            '@type': 'FAQPage',
            mainEntity: marketingFaqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          },
        ],
      }).replace(/</g, '\\u003c'),
    },
  ],
})
</script>
<template>
  <main id="main-content" ref="landingRoot">
    <section class="hero section-wrap">
      <div class="hero-copy">
        <div class="eyebrow"><span class="status-dot" /> A-COMMERCE. BUILT AROUND YOU.</div>
        <h1>
          Your big idea.<br />Your kind of store.<br /><span>Just say the word.</span
          ><svg class="headline-swish" viewBox="0 0 450 20" aria-hidden="true">
            <path d="M5 14 Q200 -4 444 9" />
          </svg>
        </h1>
        <p>
          Meet A-commerce: your ambition, with AI that helps turn it into action. Build a store
          that’s entirely yours, shape the details in conversation, and keep your business in view.
        </p>
        <div class="hero-actions">
          <NuxtLink to="/register" class="button button-orange"
            >Let’s build your store <ArrowUpRight :size="19" /></NuxtLink
          ><NuxtLink to="#acommerce" class="text-link"
            >What’s A-commerce? <ArrowRight :size="16"
          /></NuxtLink>
        </div>
        <div class="hero-footnote">
          <span><Check :size="14" /> Your brand. Your rules.</span
          ><span><Check :size="14" /> From first idea to next big thing.</span>
        </div>
      </div>
      <div class="hero-art">
        <div class="orbit-label">DREAM IT. BUILD IT. MARKIT.</div>
        <div class="mini-store">
          <div class="mini-store-nav">
            <strong>peach club<span>®</span></strong
            ><span>Objects of affection <ShoppingBag :size="15" /></span>
          </div>
          <div class="mini-store-content">
            <span>NOT MADE TO BLEND IN.</span>
            <h2>A little bold.<br />A lot like you.</h2>
            <span class="mini-shop">Find your thing <ArrowUpRight :size="13" /></span>
          </div>
          <img
            src="/images/marketing/commerce-studio.webp"
            alt="Orange sculptural bag, lavender sneaker and blue skincare tube in a playful studio display"
            width="1536"
            height="1024"
            fetchpriority="high"
            class="hero-product"
          />
          <div class="mini-store-bottom">
            <span>GOOD DESIGN. GREAT MOOD.</span><span>001 — THE EVERYDAY EDIT</span>
          </div>
        </div>
        <div class="floating-prompt">
          <span class="ai-icon"><Sparkles :size="19" /></span>
          <div>
            <small>YOU DREAM IT</small>
            <p>“Make it feel more… me.”</p>
          </div>
          <span class="prompt-arrow"><ArrowUpRight :size="18" /></span>
        </div>
        <div class="floating-status">
          <span><CheckCheck :size="18" /></span>
          <div>Made it yours.<small>Ready for your next big idea.</small></div>
        </div>
        <div class="star-doodle" aria-hidden="true">✳</div>
        <span class="hero-caption">An example brand. Endless possibilities.</span>
      </div>
    </section>
    <div class="capability-strip">
      <span>ONE PLATFORM. ZERO BORING.</span><strong>Dream <span>↗</span></strong
      ><strong>Build <span>✳</span></strong
      ><strong>Sell <span>↗</span></strong
      ><strong>Run <span>✳</span></strong
      ><strong>Repeat <span>↗</span></strong>
    </div>
    <section id="acommerce" class="section-wrap acommerce-section">
      <div class="section-heading">
        <div>
          <div class="eyebrow">01 / A NEW WAY TO COMMERCE</div>
          <h2>Big ideas.<br /><span>Now with follow-through.</span></h2>
        </div>
        <p>
          <strong>A-commerce means agentic commerce.</strong> AI agents use tools to carry out tasks
          toward a goal. For your store, that means moving from a conversation to a working change,
          with you deciding what goes live.
        </p>
      </div>
      <div class="acommerce-flow">
        <article class="acommerce-card">
          <div class="acommerce-card-top">
            <span class="step-number">01</span><Send :size="22" />
          </div>
          <h3>You set the direction.</h3>
          <p>
            Describe the experience you want, your brand’s personality and what a great result looks
            like.
          </p>
          <div class="action-example">“Give our new collection a launch page.”</div>
        </article>
        <article class="acommerce-card">
          <div class="acommerce-card-top">
            <span class="step-number">02</span><Sparkles :size="22" />
          </div>
          <h3>AI gets to work.</h3>
          <p>
            In Markit’s editor, your request becomes storefront code and a preview you can explore
            and refine.
          </p>
          <div class="action-example"><span class="action-dot" /> Design → build → preview</div>
        </article>
        <article class="acommerce-card">
          <div class="acommerce-card-top">
            <span class="step-number">03</span><CheckCheck :size="22" />
          </div>
          <h3>You make the call.</h3>
          <p>
            Check the details, try the shopping journey and publish when it feels right. Your brand
            stays yours.
          </p>
          <div class="action-example">
            <Check :size="14" /> Reviewed by you. Ready for the world.
          </div>
        </article>
      </div>
      <div class="acommerce-note">
        <span class="ai-icon"><Bot :size="20" /></span>
        <p>
          <strong>Your store, with an AI teammate.</strong> Start with storefront creation. Extend
          it with custom plugins and agents for the jobs your business needs.
        </p>
        <NuxtLink to="#build" class="text-link"
          >See it in action <ArrowDownRight :size="17"
        /></NuxtLink>
      </div>
    </section>
    <section id="build" class="section-wrap build-section">
      <div class="section-heading">
        <div>
          <div class="eyebrow">02 / YOUR STORE, WITHOUT THE CEILING</div>
          <h2>If you can imagine it,<br /><span>let’s make it a store.</span></h2>
        </div>
        <p>
          A beautiful homepage is just the beginning. Shape every page, every interaction and every
          little “that’s so us” detail with AI.
        </p>
      </div>
      <StorefrontDemo />
      <div class="build-benefits">
        <span><Check /> Beyond templates</span><span><Check /> Custom features & journeys</span
        ><span><Check /> Preview before publishing</span
        ><span><Check /> Beautiful on every screen</span>
      </div>
    </section>
    <section id="ai" class="ai-section">
      <div class="section-wrap">
        <div class="section-heading">
          <div>
            <div class="eyebrow">03 / YOUR EVERYDAY CREATIVE STUDIO.</div>
            <h2>Wear fewer hats.<br /><span>Make more magic.</span></h2>
          </div>
          <p>
            Your writer, designer and development partner, all in the same conversation. More room
            for the work you love.
          </p>
        </div>
        <div class="ai-grid">
          <article
            v-for="feature in aiFeatures"
            :key="feature.title"
            class="ai-card"
            :class="feature.class"
          >
            <component :is="feature.icon" :size="26" />
            <div v-if="feature.class === 'peach'" class="copy-visual">
              <small>PRODUCT DESCRIPTION <Sparkles :size="12" /></small>
              <p>Not just a bag.<br />Your <em>new plus-one.</em><span class="type-caret" /></p>
              <span>✓ Brand voice: a little cheeky</span>
            </div>
            <div v-else-if="feature.class === 'lilac'" class="image-visual">
              <img
                src="/images/marketing/creative-studio.webp"
                alt="Orange perfume bottle with a cobalt cap and lavender skincare on a mirrored podium"
                width="900"
                height="600"
                loading="lazy"
              /><span><Sparkles :size="12" /> A fresh perspective</span>
            </div>
            <div v-else class="search-visual">
              <span>yourbrand.store › collections</span
              ><strong>The everyday bag, reimagined.</strong>
              <p>
                A little room for everything. Discover thoughtfully designed bags for wherever life
                takes you.
              </p>
              <div><Check :size="12" /> Title & description, ready to review</div>
            </div>
            <div class="card-tag">{{ feature.tag }}</div>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.text }}</p>
          </article>
        </div>
        <div class="ai-extra">
          <Sparkles :size="18" />
          <p>
            And then some: translate your store, prototype a gift finder, draft size guides, create
            campaign pages, or build a smarter product comparison.
          </p>
          <span>YOUR NEXT “WHAT IF?” STARTS HERE.</span>
        </div>
      </div>
    </section>
    <section class="section-wrap extensions-section">
      <div class="extension-copy">
        <div class="eyebrow">04 / GO A LITTLE OFF-SCRIPT</div>
        <h2>
          Your ideas don’t<br />come in a template.<br /><span>Neither should your store.</span>
        </h2>
        <p>
          Build the extra thing that makes your business your business. Use AI to develop your own
          plugins, custom features and purpose-built agents.
        </p>
        <NuxtLink to="/register" class="text-link"
          >Make something only you would make <ArrowUpRight :size="18"
        /></NuxtLink>
      </div>
      <div class="extension-cards">
        <article class="plugin-card">
          <span class="card-icon"><Blocks :size="24" /></span
          ><span class="card-tag">BUILD YOUR OWN PLUGINS</span>
          <h3>“What if our store could…?”<br />Yes. Start there.</h3>
          <p>
            A mix-and-match bundle builder. A personalised gift quiz. A made-to-order product flow.
            Build the extension your idea deserves.
          </p>
          <div class="plugin-chips">
            <span>Bundle builder <Plus :size="13" /></span
            ><span>Gift finder <Plus :size="13" /></span
            ><span>Your next idea <Plus :size="13" /></span>
          </div>
        </article>
        <article class="agent-card">
          <span class="card-icon"><Bot :size="24" /></span
          ><span class="card-tag">CREATE YOUR OWN AGENTS</span>
          <h3>A little team.<br />With your way of thinking.</h3>
          <p>
            Design a brand-trained shopping guide, a content assistant or an inventory helper.
            Define its job, connect the right tools and keep approvals in your hands.
          </p>
          <div class="agent-flow">
            <span><Bot :size="16" /> Your agent</span><ArrowRight :size="16" /><span
              >Your tools</span
            ><ArrowRight :size="16" /><span>Your rules</span>
          </div>
        </article>
        <small class="extension-note"
          >Custom plugins and agents are development projects. Integrations, permissions and testing
          depend on what you build.</small
        >
      </div>
    </section>
    <section id="operations" class="operations-section">
      <div class="section-wrap">
        <div class="section-heading">
          <div>
            <div class="eyebrow">05 / BEAUTY UP FRONT. BUSINESS IN THE BACK.</div>
            <h2>Big shop energy.<br /><span>One calm back office.</span></h2>
          </div>
          <p>
            A storefront gets you seen. A solid operation keeps you growing. Meet the ERP behind
            your next chapter.
          </p>
        </div>
        <div class="operations-grid">
          <div class="erp-preview">
            <div class="erp-top">
              <span class="brand-symbol">m</span><strong>Your business, at a glance</strong
              ><span class="demo-label">ILLUSTRATIVE PREVIEW</span>
            </div>
            <div class="erp-stats">
              <div>
                <small>Sales overview</small><strong>All in view <span>↗</span></strong>
              </div>
              <div><small>Online + in store</small><strong>Better together</strong></div>
            </div>
            <div class="chart-bars" aria-label="Illustrative sales chart">
              <span
                v-for="(height, i) in [27, 42, 36, 61, 48, 68, 58, 79, 70, 92, 83, 100]"
                :key="i"
                :style="{ height: `${height}%` }"
              />
            </div>
            <div class="chart-axis">
              <span>YOUR FIRST SALE</span><span>YOUR NEXT CHAPTER ↗</span>
            </div>
            <div class="erp-row">
              <span><Package :size="18" /> Inventory</span
              ><span><Check :size="12" /> Organised</span>
            </div>
            <div class="erp-row">
              <span><ShoppingBag :size="18" /> Orders & fulfilment</span
              ><span><Check :size="12" /> In view</span>
            </div>
            <div class="erp-row">
              <span><Users :size="18" /> Customer relationships</span
              ><span><Check :size="12" /> Connected</span>
            </div>
          </div>
          <div class="operations-features">
            <article v-for="item in operations" :key="item.title">
              <component :is="item.icon" :size="23" />
              <div>
                <h3>{{ item.title }}</h3>
                <p>{{ item.text }}</p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
    <section id="pricing" class="section-wrap pricing-section">
      <div class="center-heading">
        <div class="eyebrow">06 / ROOM FOR YOUR NEXT BIG THING</div>
        <h2>Small beginnings.<br /><span>Very big possibilities.</span></h2>
        <p>Find your fit. Make it yours. Grow from there.</p>
      </div>
      <div class="billing-toggle" aria-label="Billing period">
        <button :class="{ active: !yearly }" :aria-pressed="!yearly" @click="yearly = false">
          Monthly</button
        ><button :class="{ active: yearly }" :aria-pressed="yearly" @click="yearly = true">
          Yearly <span>Save up to 20%</span>
        </button>
      </div>
      <div class="pricing-grid">
        <article
          v-for="(plan, index) in marketingPlans"
          :key="plan.name"
          class="price-card"
          :class="{ popular: index === 1 }"
        >
          <div v-if="index === 1" class="popular-banner">
            <Sparkles :size="12" /> THE CROWD FAVOURITE
          </div>
          <h3>{{ plan.name }}<span v-if="index === 1">BEST DEAL</span></h3>
          <p class="plan-description">{{ plan.description }}</p>
          <div class="plan-price" aria-live="polite">
            <small v-if="index === 3">from </small
            ><del v-if="yearly && index !== 3">₹{{ plan.monthly }}</del
            ><strong>₹{{ yearly ? plan.yearly : plan.monthly }}</strong
            ><small>/mo</small>
          </div>
          <p class="billing-note">
            {{
              yearly && plan.annualTotal
                ? `₹${plan.annualTotal} billed yearly`
                : index === 3
                ? 'Let’s find the right fit for your business'
                : 'Billed monthly'
            }}
          </p>
          <a
            v-if="index === 3"
            href="mailto:reez@markit.co.in?subject=Markit%20Plus%20plan"
            class="button button-dark"
            >Talk to the team <ArrowUpRight :size="15" /></a
          ><NuxtLink
            v-else
            to="/register"
            class="button"
            :class="index === 1 ? 'button-orange' : 'button-dark'"
            >Start for free <ArrowUpRight :size="15"
          /></NuxtLink>
          <div class="plan-models">
            <span class="card-tag">AI MODELS</span>
            <p><Check :size="13" /> Access to basic models</p>
            <p :class="{ unavailable: !plan.advanced }">
              <component :is="plan.advanced ? Check : Minus" :size="13" /> Advanced model access
            </p>
            <div class="model-badges" :class="{ unavailable: !plan.advanced }">
              <span>FABLE 5.5.1</span><span>GPT-6 ASTRA</span>
            </div>
          </div>
          <div class="plan-feature-list">
            <span class="card-tag">THE GOOD STUFF</span>
            <p><Check :size="13" /> {{ plan.scope }}</p>
            <p
              v-for="(feature, fi) in planFeatures"
              :key="feature"
              :class="{ unavailable: !plan.features[fi] }"
            >
              <component :is="plan.features[fi] ? Check : Minus" :size="13" />{{
                fi === 4 && index >= 2 ? 'Slack channel + priority support' : feature
              }}
            </p>
          </div>
        </article>
      </div>
      <p class="pricing-footnote">
        Yearly prices shown as monthly equivalents. Savings vary by plan. Start for free takes you
        to account registration; paid plan activation is arranged separately.
      </p>
    </section>
    <section class="section-wrap faq-section">
      <div>
        <div class="eyebrow">THE “WAIT, CAN I…?” CORNER</div>
        <h2>Good questions.<br /><span>Straight answers.</span></h2>
        <p>Still curious? <a href="mailto:reez@markit.co.in" class="text-link">Let’s talk ↗</a></p>
      </div>
      <div class="faq-list">
        <details v-for="faq in marketingFaqs" :key="faq.question">
          <summary>{{ faq.question }}<Plus :size="18" /></summary>
          <p>{{ faq.answer }}</p>
        </details>
      </div>
    </section>
    <section class="final-cta">
      <div class="cta-spark" aria-hidden="true">✳</div>
      <div class="eyebrow">THE NEXT GREAT BRAND COULD BE YOURS.</div>
      <h2>Less “one day.”<br />More <em>day one.</em></h2>
      <p>You bring the idea. We’ll bring the possibilities.</p>
      <NuxtLink to="/register" class="button button-dark"
        >Let’s make it happen <ArrowUpRight :size="19" /></NuxtLink
      ><span class="cta-doodle" aria-hidden="true">↗</span>
    </section>
  </main>
</template>
