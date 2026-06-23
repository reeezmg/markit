import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { GoogleGenAI } from '@google/genai'
import { schemaMap } from '~/lib/ecom-engine-schemas'
import { pool } from '~/server/db'

const REVOMOTIVE = resolve(process.cwd(), '../revomotive/client/src')

// ─── Section keyword index ────────────────────────────────────────────────────

const TYPE_KEYWORDS: Record<string, string[]> = {
  'hero-banner':     ['hero', 'banner', 'landing', 'top', 'header', 'main', 'headline', 'background', 'cta', 'button'],
  'marquee-banner':  ['marquee', 'ticker', 'scrolling', 'announcement', 'strip'],
  'product-grid':    ['product', 'grid', 'shop', 'item', 'collection', 'catalog', 'listing', 'card'],
  'category-grid':   ['category', 'categories', 'browse', 'department'],
  'faq-accordion':   ['faq', 'question', 'answer', 'accordion', 'help', 'support'],
  'newsletter-form': ['newsletter', 'email', 'subscribe', 'signup', 'form'],
  'review-carousel': ['review', 'testimonial', 'carousel', 'rating', 'feedback', 'star'],
  'feature-columns': ['feature', 'benefit', 'highlight', 'column', 'why', 'service'],
  'promo-card':      ['promo', 'promotion', 'offer', 'deal', 'discount', 'sale'],
  'blog-grid':       ['blog', 'post', 'article', 'news'],
  'page-hero':       ['page', 'hero', 'header', 'title'],
  'stats-grid':      ['stat', 'statistic', 'number', 'metric', 'count'],
  'value-columns':   ['value', 'mission', 'pillar', 'principle'],
  'contact-layout':  ['contact', 'reach', 'touch', 'form', 'address', 'location'],
  'steps-list':      ['step', 'process', 'how', 'guide', 'instruction'],
  'track-form':      ['track', 'tracking', 'order', 'status'],
  'custom-html':     ['custom', 'html', 'code'],
  'data-block':      ['data', 'dynamic', 'block', 'custom'],
}

function sectionKeywords(id: string, type: string, settings: any = {}): string[] {
  const base = TYPE_KEYWORDS[type] ?? []
  const idWords = id.toLowerCase().split(/[-_\d]+/).filter(w => w.length > 2)
  const textKw: string[] = []
  for (const key of ['heading', 'title', 'label']) {
    if (typeof settings[key] === 'string')
      textKw.push(...settings[key].toLowerCase().split(/\s+/).slice(0, 3))
  }
  return [...new Set([...base, ...idWords, ...textKw])]
}

function findSection(target: string, pageConfig: any): string | null {
  const sections = pageConfig?.sections ?? {}
  const order: string[] = pageConfig?.order ?? []
  if (sections[target]) return target   // exact ID match

  const targetWords = target.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter(w => w.length > 1)
  let best: string | null = null, bestScore = 0

  for (const id of order) {
    const s = sections[id]
    if (!s) continue
    const kw = sectionKeywords(id, s.type, s.settings)
    let score = 0
    for (const tw of targetWords)
      for (const k of kw) {
        if (k === tw) score += 10
        else if (k.startsWith(tw) || tw.startsWith(k)) score += 5
        else if (k.includes(tw) || tw.includes(k)) score += 3
      }
    if (score > bestScore) { bestScore = score; best = id }
  }
  return bestScore > 0 ? best : null
}

// ─── Element keys per section type ───────────────────────────────────────────

const ELEMENT_KEYS: Record<string, string[]> = {
  'hero-banner':     ['root', 'image', 'body', 'heading', 'button'],
  'marquee-banner':  ['root', 'track', 'item', 'separator'],
  'product-grid':    ['root', 'grid'],
  'category-grid':   ['root', 'grid', 'card', 'card_icon', 'card_label', 'card_count'],
  'feature-columns': ['root', 'grid', 'item', 'item_icon', 'item_title', 'item_body'],
  'review-carousel': ['root', 'inner', 'scroll', 'card', 'card_title', 'card_body', 'card_author'],
  'blog-grid':       ['root', 'grid', 'card', 'card_thumb', 'card_tag', 'card_body', 'card_title', 'card_meta'],
  'faq-accordion':   ['root', 'list', 'item', 'item_question', 'item_answer'],
  'newsletter-form': ['root', 'form', 'input', 'button'],
  'promo-card':      ['root', 'banner', 'title', 'button'],
  'page-hero':       ['root', 'inner', 'heading'],
  'stats-grid':      ['root', 'inner', 'card', 'card_num', 'card_label'],
  'value-columns':   ['root', 'inner', 'grid', 'item', 'item_icon', 'item_title', 'item_body'],
  'contact-layout':  ['root', 'form_wrap', 'form_title', 'form', 'input', 'button'],
  'steps-list':      ['root', 'inner', 'step', 'step_badge', 'step_line', 'step_content', 'step_icon', 'step_title', 'step_body'],
  'track-form':      ['root', 'form', 'input', 'button', 'result', 'timeline', 'step', 'hint'],
  'custom-html':     ['root'],
  'custom-block':    ['root'],
  'data-block':      ['root'],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeToFolder(type: string): string {
  return type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

async function componentSource(type: string): Promise<string> {
  try { return await readFile(resolve(REVOMOTIVE, 'sections', typeToFolder(type), 'index.vue'), 'utf-8') }
  catch { return '' }
}

function propDocs(type: string): string {
  const schema = schemaMap[type]
  if (!schema) return ''
  return schema.settings.map((f: any) =>
    `  ${f.id} (${f.type})${f.default !== undefined ? ` — default: ${JSON.stringify(f.default)}` : ''}${f.help ? ` — ${f.help}` : ''}`
  ).join('\n')
}

// ─── Custom elements reference (JsonElementRenderer) ─────────────────────────

const JER_DOC = `
## Custom Elements System (JsonElementRenderer)

Sections are intentionally minimal — they expose injection slots for arbitrary read-only markup.
Use custom elements to add any visual content that isn't a structural/data requirement of the section.

### When to use custom elements instead of section props:
- Section titles and eyebrow text (all removed from sections — must use custom_elements_top)
- Trust indicators, badges, rating summaries
- "View all" / "See all" CTA links after grids
- Decorative dividers, spacers, watermark images
- Contact channels / social links (removed from ContactLayout — use custom_elements_top)
- Secondary CTAs after a hero button
- Any promotional/marketing copy around a functional section

### Node format (JER node)
\`\`\`
{
  "id":       "unique-string",           // required — must be unique within the array
  "tag":      "div",                     // see allowed tags below
  "text":     "visible text content",    // leaf text (empty string for containers)
  "attrs": {
    "class":  "tailwind classes",        // Tailwind v3 utility classes
    "style":  "inline CSS string",       // for values not in Tailwind
    "href":   "navigate:/path",          // see navigation below
    "src":    "https://...",             // for img tags
    "alt":    "alt text",
    "target": "_blank"
  },
  "children": []                         // nested JER nodes of same format
}
\`\`\`

### Allowed tags
div, span, p, h1, h2, h3, h4, h5, h6, img, a, button, ul, ol, li,
section, article, header, footer, figure, figcaption, strong, em, br, hr, label

### Styling with Tailwind v3
All standard Tailwind utility classes work (safelisted at runtime):
- Layout:      flex items-center justify-between gap-4, grid grid-cols-3 gap-6, w-full max-w-sm
- Spacing:     p-4 px-6 py-3, mt-4 mb-2 mx-auto, space-x-3 space-y-2
- Typography:  text-sm text-base text-lg text-xl text-2xl text-3xl, font-bold font-semibold font-medium
               uppercase tracking-wide tracking-widest, leading-tight leading-relaxed, text-center
- Colors:      text-white text-gray-400, bg-white/10 bg-black/20 bg-amber-400
               border border-white/20 border-gray-700, opacity-60
- Shapes:      rounded-full rounded-lg rounded-xl, shadow-md shadow-lg
- Sizing:      w-12 h-12 min-h-[200px], aspect-square, object-cover

### Brand CSS variables (use in style="...")
var(--fg1)          — primary text
var(--fg2)          — secondary text
var(--fg3)          — muted text
var(--accent-500)   — brand accent (primary)
var(--accent-400)   — brand accent (lighter)
var(--accent-bg)    — accent tinted background
var(--surface)      — card background
var(--surface-2)    — elevated surface
var(--border)       — default border
var(--border-strong)— strong border
var(--r-sm) / --r-md / --r-lg / --r-xl / --r-pill  — border-radius tokens
var(--font-display) — display/heading font
var(--font-body)    — body font
var(--shadow-md) / --shadow-lg  — box shadows

### Navigation (SPA-aware, no page reload)
Use "navigate:" prefix in href — triggers Vue Router push instead of browser navigation.
- href="navigate:/shop"           → router.push('/shop')
- href="navigate:/shop?cat=wax"   → router.push('/shop?cat=wax')
- href="navigate:/product/abc"    → router.push('/product/abc')
Normal hrefs (/external, https://) do a browser navigation.

### Injection points
Each section has TWO injection slots (both in section.settings):
  custom_elements_top  — rendered BEFORE all section content
  custom_elements      — rendered AFTER all section content

Page-level slots (in pageConfig.slots) — inject BETWEEN sections:
  "start"              — before all sections
  "end"                — after all sections
  "before:{sectionId}" — immediately before that section
  "after:{sectionId}"  — immediately after that section

### Example: section title + eyebrow (custom_elements_top on ProductGrid)
\`\`\`json
[
  { "id":"ey","tag":"p","text":"Our collection","attrs":{"class":"text-xs font-bold uppercase tracking-widest mb-1","style":"color:var(--accent-400)"},"children":[] },
  { "id":"h", "tag":"h2","text":"Shop bestsellers","attrs":{"class":"text-2xl font-bold mb-6","style":"color:var(--fg1);font-family:var(--font-display)"},"children":[] }
]
\`\`\`

### Example: "View all" link after section (custom_elements on ProductGrid)
\`\`\`json
[{ "id":"cta","tag":"a","text":"View all products →","attrs":{"href":"navigate:/shop","class":"block text-center text-sm font-semibold mt-6 py-3","style":"color:var(--accent-400)"},"children":[] }]
\`\`\`

### Example: trust bar inside hero body after CTA (custom_elements on HeroBanner)
\`\`\`json
[{ "id":"tr","tag":"div","text":"","attrs":{"class":"flex flex-wrap gap-5 mt-5","style":"font-size:12px;color:rgba(255,255,255,.62)"},"children":[
  {"id":"t1","tag":"span","text":"✓ Free delivery over ₹200","attrs":{},"children":[]},
  {"id":"t2","tag":"span","text":"✓ pH-balanced formula","attrs":{},"children":[]},
  {"id":"t3","tag":"span","text":"★ 4.9 rated","attrs":{},"children":[]}
]}]
\`\`\`

### Example: contact channels before form (custom_elements_top on ContactLayout)
\`\`\`json
[{ "id":"ch","tag":"div","text":"","attrs":{"class":"flex flex-col gap-3 mb-6"},"children":[
  {"id":"c1","tag":"a","text":"support@brand.com","attrs":{"href":"mailto:support@brand.com","class":"text-sm","style":"color:var(--accent-400)"},"children":[]},
  {"id":"c2","tag":"div","text":"+91 98765 43210","attrs":{"class":"text-sm","style":"color:var(--fg2)"},"children":[]}
]}]
\`\`\`

### Example: divider between hero and products (pageSlotChanges)
Set pageSlotChanges to: { "after:hero_section_id": [{ "id":"div","tag":"hr","attrs":{"class":"mx-6 opacity-10"},"children":[] }] }

### What you CANNOT do with custom elements
- No <script> tags (blocked)
- No event handlers (onclick, oninput etc.) — use navigate: href for links only
- No CSS selectors / @media — use Tailwind classes or inline style only
- No Vue/React components — only raw HTML tags from the allowed list
`

// ─── First-message context document ──────────────────────────────────────────

async function buildContextDoc(
  pageConfig: any,
  storefrontMemory: any,
  pageSlug: string,
): Promise<string> {
  const sections = pageConfig.sections ?? {}
  const order: string[] = pageConfig.order ?? []

  // Load source for every unique section type on this page
  const loaded = new Set<string>()
  const srcParts: string[] = []
  for (const id of order) {
    const type = sections[id]?.type
    if (type && !loaded.has(type)) {
      loaded.add(type)
      const src = await componentSource(type)
      if (src) {
        const keys = (ELEMENT_KEYS[type] ?? []).join(', ')
        const pdocs = propDocs(type)
        srcParts.push(
          `### ${type}  (id on page: ${id})\n` +
          `classes keys: ${keys}\n` +
          `props:\n${pdocs}\n` +
          `\`\`\`vue\n${src}\n\`\`\``
        )
      }
    }
  }

  // Section summary for quick reference
  const sectionSummary = order.map((id: string) => {
    const s = sections[id]
    if (!s) return ''
    const settings = { ...s.settings }
    // Remove bulky array defaults for brevity
    for (const k of Object.keys(settings)) {
      if (Array.isArray(settings[k]) && settings[k].length > 3) {
        settings[k] = `[...${settings[k].length} items]`
      }
    }
    return `- **${id}** (${s.type}): ${JSON.stringify(settings)}`
  }).filter(Boolean).join('\n')

  return `# Storefront Designer — Page: "${pageSlug}"

You are an expert storefront designer for Revomotive, a premium car detailing product brand.
You have full access to the page layout, brand identity, and all section source code below.

When the user asks to customize the storefront, return a precise JSON patch.
When the user asks a question, answer it directly using the context below.

---
## Brand Identity & Memory
\`\`\`json
${JSON.stringify(storefrontMemory ?? {}, null, 2)}
\`\`\`

---
## Current Page Config (slug: ${pageSlug})
Section order: ${order.join(' → ')}

\`\`\`json
${JSON.stringify(pageConfig, null, 2)}
\`\`\`

Section quick-reference:
${sectionSummary}

---
## Section Source Code (all sections on this page)
${srcParts.join('\n\n---\n\n')}

---
${JER_DOC}

---
## Wrapper style keys (for styleChanges)
bg, color, py, px, align, borderRadius, fontSize, fontWeight, opacity, shadow,
borderWidth, borderStyle, borderColor, customCss

---
## Patch response format (JSON, required for changes)
\`\`\`json
{
  "explanation":    "one sentence — what was changed or why it cannot be done",
  "sectionId":      "id of the section being patched",
  "changes":        {},
  "styleChanges":   {},
  "pageSlotChanges": {}
}
\`\`\`
- changes: prop name → new value. May include "classes" (elementKey→classString), "custom_elements_top", "custom_elements"
- styleChanges: wrapper style key → value
- pageSlotChanges: "start"|"end"|"before:{id}"|"after:{id}" → JER node array
- Only set fields that change; empty {} for no changes in that category
`
}

// ─── Intent extraction ────────────────────────────────────────────────────────

async function extractIntent(msg: string, pageConfig: any, genai: any) {
  const sectionList = (pageConfig?.order ?? []).map((id: string) => {
    const s = pageConfig?.sections?.[id]
    return `${id} (${s?.type})`
  }).join(', ')

  try {
    const res = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Classify this storefront request.

Page sections: ${sectionList}

User: "${msg}"

Return JSON:
{
  "target": "section keyword or ID (e.g. hero, products, faq, newsletter) — 'page' for whole-page changes",
  "action": "update | add | remove | question",
  "changes": ["specific things to change"],
  "description": "full plain-english description",
  "isQuestion": false
}` }] }],
      config: { responseMimeType: 'application/json' },
    })
    return JSON.parse(res.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}')
  } catch {
    return { target: '', action: 'update', changes: [], description: msg, isQuestion: false }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody(event)
  const { messages, pageSlug, storefrontMemory } = body ?? {}

  if (!messages?.length) throw createError({ statusCode: 400, message: 'messages required' })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  // ── SSE setup ────────────────────────────────────────────────────────────────

  const res = event.node.res
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  function push(data: object) { try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {} }

  // ── Always fetch fresh config from DB ────────────────────────────────────────

  const companyId = session.data.companyId
  const { rows } = await pool.query(
    `SELECT config FROM storefront_pages WHERE company_id = $1 AND slug = $2`,
    [companyId, pageSlug]
  )
  const pageConfig = rows[0]?.config ?? { sections: {}, order: [] }

  const genai = new GoogleGenAI({ apiKey })
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''

  // First message = no previous assistant turns in the conversation
  const isFirstMessage = messages.filter((m: any) => m.role === 'user').length === 1

  console.log('\n=== STOREFRONT AI ===')
  console.log('Page:', pageSlug, '| Sections:', Object.keys(pageConfig.sections ?? {}).length)
  console.log('User:', lastUserMsg, '| First message:', isFirstMessage)

  // ── Phase 0: Prime context on first message ───────────────────────────────────
  //
  // On the first user message we inject a rich context document as a synthetic
  // conversation prefix [user→model] so that all subsequent turns in this session
  // have full brand + page + source + JER knowledge without repeating it every time.

  let contextHistory: any[] = []
  if (isFirstMessage) {
    push({ type: 'status', text: 'Loading storefront context...' })
    const ctxDoc = await buildContextDoc(pageConfig, storefrontMemory, pageSlug)
    contextHistory = [
      {
        role: 'user',
        parts: [{ text: ctxDoc }],
      },
      {
        role: 'model',
        parts: [{
          text:
            `Context loaded for page "${pageSlug}". I can see ${(pageConfig.order ?? []).length} sections: ` +
            `${(pageConfig.order ?? []).join(', ')}. ` +
            `I have the brand identity, all section source code, the current page JSON, and the full custom elements reference. ` +
            `Ready to design and customize the storefront.`,
        }],
      },
    ]
    console.log('[context primed]', ctxDoc.length, 'chars')
  }

  // Build client-message history (all turns before the current request)
  const clientHistory = messages.slice(0, -1).map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  // ── Phase 1: Intent extraction ────────────────────────────────────────────────

  push({ type: 'status', text: 'Analyzing request...' })
  const intent = await extractIntent(lastUserMsg, pageConfig, genai)
  console.log('Intent:', JSON.stringify(intent))
  push({ type: 'intent', ...intent })

  // ── Phase 2: Resolve target section ──────────────────────────────────────────

  const targetId = findSection(intent.target, pageConfig)
  const targetSection = targetId ? pageConfig.sections[targetId] : null
  console.log('Target:', targetId, targetSection?.type ?? '(none)')

  // ── Phase 3: Handle questions ─────────────────────────────────────────────────

  if (intent.isQuestion) {
    push({ type: 'status', text: 'Answering...' })
    console.log(contextHistory, clientHistory, lastUserMsg)
    const qRes = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...contextHistory,
        ...clientHistory,
        { role: 'user', parts: [{ text: lastUserMsg }] },
      ],
    })
    console.log('[LLM question response]', qRes)
    const answer = qRes.candidates?.[0]?.content?.parts?.[0]?.text ?? 'I could not find an answer.'
    for (let i = 0; i < answer.length; i += 4) {
      push({ type: 'text', chunk: answer.slice(i, i + 4) })
      await new Promise(r => setTimeout(r, 8))
    }
    push({ type: 'done' })
    res.end()
    return null
  }

  // ── Phase 4: Validate target ──────────────────────────────────────────────────

  if (!targetId || !targetSection) {
    const available = (pageConfig?.order ?? []).join(', ')
    push({ type: 'text', chunk: `I couldn't find a section matching "${intent.target}". Available sections on this page: ${available}` })
    push({ type: 'done' })
    res.end()
    return null
  }

  push({ type: 'status', text: `Patching ${targetId} (${targetSection.type})...` })

  // On subsequent messages, load fresh source for the target (context has all sources on first message)
  const targetSrc = isFirstMessage ? '(source already in context above)' : await componentSource(targetSection.type)

  // ── Phase 5: Generate patch ───────────────────────────────────────────────────

  push({ type: 'status', text: 'Generating change...' })

  const patchPrompt = `Apply this storefront change. Return ONLY a JSON patch.

## Target
Section ID: ${targetId}
Type: ${targetSection.type}

## Current settings (live from DB — may differ from context if changes were made this session)
\`\`\`json
${JSON.stringify(targetSection.settings ?? {}, null, 2)}
\`\`\`

## Current styles (wrapper-level)
\`\`\`json
${JSON.stringify(targetSection.styles ?? {}, null, 2)}
\`\`\`

## Available props for ${targetSection.type}
${propDocs(targetSection.type)}

## Valid element keys for classes.{key}
${(ELEMENT_KEYS[targetSection.type] ?? []).join(', ')}

${!isFirstMessage
  ? `## Section source\n\`\`\`vue\n${targetSrc}\n\`\`\``
  : '(Section source is in the conversation context above — refer to it.)'
}

## Request
${intent.description}
Specific: ${(intent.changes ?? []).join(', ')}

## Rules
- changes: use only prop names listed in "Available props" above
- changes.classes: { elementKey: "FULL tailwind/CSS class string" } — keys from the valid list above only
- changes.custom_elements_top / custom_elements: JER node arrays (see JER reference in context)
- styleChanges: use only: bg, color, py, px, align, borderRadius, fontSize, fontWeight, opacity, shadow, borderWidth, borderStyle, borderColor, customCss
- pageSlotChanges: use when adding content BETWEEN sections (keys: "start", "end", "before:{id}", "after:{id}")
- When setting classes, always write the COMPLETE class string (replaces the default entirely)
- If the request truly cannot be satisfied: leave changes/styleChanges/pageSlotChanges empty and explain why

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "explanation":     "one clear sentence describing what was done",
  "sectionId":       "${targetId}",
  "changes":         {},
  "styleChanges":    {},
  "pageSlotChanges": {}
}`

  let result: any = { explanation: 'No change made.', sectionId: targetId, changes: {}, styleChanges: {}, pageSlotChanges: {} }

  try {
    const mainRes = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...contextHistory,
        ...clientHistory,
        { role: 'user', parts: [{ text: patchPrompt }] },
      ],
      config: { responseMimeType: 'application/json' },
    })
    const rawJson = mainRes.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    console.log('[LLM response]', rawJson)
    try { result = JSON.parse(rawJson) } catch { console.error('[JSON parse failed]', rawJson) }
  } catch (err) {
    console.error('[LLM error]', err)
    push({ type: 'text', chunk: 'Sorry — something went wrong generating the change. Please try again.' })
    push({ type: 'done' })
    res.end()
    return null
  }

  // ── Stream explanation to client ──────────────────────────────────────────────

  const explanation: string = result.explanation ?? ''
  for (let i = 0; i < explanation.length; i += 4) {
    push({ type: 'text', chunk: explanation.slice(i, i + 4) })
    await new Promise(r => setTimeout(r, 10))
  }

  // ── Phase 6a: Apply section patch → save to DB ────────────────────────────────

  const patchSectionId: string = result.sectionId ?? targetId
  const changes: Record<string, any> = result.changes ?? {}
  const styleChanges: Record<string, any> = result.styleChanges ?? {}

  // Track latest config so Phase 6b can build on top of Phase 6a changes
  let latestConfig = { ...pageConfig }

  console.log('[patch]', JSON.stringify({ sectionId: patchSectionId, changes, styleChanges }))

  if (Object.keys(changes).length || Object.keys(styleChanges).length) {
    const section = latestConfig.sections[patchSectionId]
    if (section) {
      const patchedSection = {
        ...section,
        settings: { ...section.settings, ...changes },
        styles: { ...(section.styles ?? {}), ...styleChanges },
      }
      latestConfig = {
        ...latestConfig,
        sections: { ...latestConfig.sections, [patchSectionId]: patchedSection },
      }
      await pool.query(
        `UPDATE storefront_pages SET config = $1, updated_at = NOW() WHERE company_id = $2 AND slug = $3`,
        [JSON.stringify(latestConfig), companyId, pageSlug]
      )
      console.log('[section saved to DB]')
      push({ type: 'patch', patch: { sectionId: patchSectionId, changes, styleChanges }, newConfig: latestConfig })
    }
  }

  // ── Phase 6b: Apply page slot changes → save to DB ───────────────────────────

  const pageSlotChanges: Record<string, any> = result.pageSlotChanges ?? {}

  if (Object.keys(pageSlotChanges).length) {
    latestConfig = {
      ...latestConfig,
      slots: { ...(latestConfig.slots ?? {}), ...pageSlotChanges },
    }
    await pool.query(
      `UPDATE storefront_pages SET config = $1, updated_at = NOW() WHERE company_id = $2 AND slug = $3`,
      [JSON.stringify(latestConfig), companyId, pageSlug]
    )
    console.log('[page slots saved]', JSON.stringify(pageSlotChanges))
    push({ type: 'patch', patch: { pageSlotChanges }, newConfig: latestConfig })
  }

  push({ type: 'done' })
  res.end()
  return null
})
