export interface SettingDef {
  id: string
  type: 'text' | 'color' | 'url' | 'number' | 'select' | 'image_picker' | 'boolean' | 'array' | 'richtext' | 'element_tree' | 'object'
  label: string
  default?: any
  help?: string
  options?: any[]
  itemType?: string
  itemSchema?: SettingDef[]
}

export interface ElementNode {
  id: string
  tag: string
  text?: string
  attrs?: { style?: string; class?: string; href?: string; src?: string; alt?: string; target?: string }
  children?: ElementNode[]
}

export interface SectionStyles {
  // Background
  bg?: string
  bgType?: 'color' | 'gradient' | 'image' | 'none'
  bgFrom?: string
  bgTo?: string
  bgAngle?: number
  bgImage?: string
  // Text
  color?: string
  align?: 'left' | 'center' | 'right'
  fontWeight?: string | number
  fontSize?: number
  // Spacing
  py?: number | string
  px?: number | string
  // Border
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted'
  // Effects
  opacity?: number
  shadow?: string
  customCss?: string
}

export interface SectionSchema {
  type: string
  name: string
  settings: SettingDef[]
}

// Shared three-field suffix added to every section's settings array
const CLASSES_FIELDS = (help: string): SettingDef[] => [
  { id: 'classes',             type: 'object',       label: 'Element classes',
    help, default: {} },
  { id: 'custom_elements_top', type: 'element_tree', label: 'Custom elements (top)',
    help: 'Elements injected at the TOP of this section, before all section content', default: [] },
  { id: 'custom_elements',     type: 'element_tree', label: 'Custom elements (bottom)',
    help: 'Elements injected at the BOTTOM of this section, after all section content', default: [] },
]

export const schemas: SectionSchema[] = [
  {
    type: 'marquee-banner',
    name: 'Announcement Bar',
    settings: [
      { id: 'messages', type: 'array', label: 'Messages', itemType: 'text',
        default: ['Free delivery over RS 200', 'Genuine pro-grade formulas', '4.9★ rated by 1,000+ owners', 'Coating-safe & pH balanced'] },
      { id: 'speed', type: 'select', label: 'Speed', options: ['slow', 'normal', 'fast'], default: 'normal' },
      ...CLASSES_FIELDS('Element keys: root, track, item, separator'),
    ]
  },
  {
    type: 'hero-banner',
    name: 'Hero Banner',
    settings: [
      { id: 'heading',   type: 'text',         label: 'Heading',      default: 'Showroom finish,\nbuilt to last.' },
      { id: 'image',     type: 'image_picker', label: 'Background image' },
      { id: 'cta_label', type: 'text',         label: 'Button text',  default: 'Shop now' },
      { id: 'cta_url',   type: 'url',          label: 'Button URL',   default: '/shop' },
      ...CLASSES_FIELDS('Element keys: root, image, body, heading, button'),
    ]
  },
  {
    type: 'category-grid',
    name: 'Shop by Category',
    settings: [
      ...CLASSES_FIELDS('Element keys: root, grid, card, card_icon, card_label, card_count'),
    ]
  },
  {
    type: 'product-grid',
    name: 'Product Grid',
    settings: [
      { id: 'section_id', type: 'text',   label: 'Collection key', default: 'Bestsellers',
        help: 'Must match a key returned by /bootstrap (e.g. Bestsellers, Featured products, New launches)' },
      { id: 'columns',    type: 'select', label: 'Columns', options: [2, 3, 4], default: 4 },
      ...CLASSES_FIELDS('Element keys: root, grid'),
    ]
  },
  {
    type: 'promo-card',
    name: 'Promo Banner',
    settings: [
      { id: 'title',     type: 'text', label: 'Title',       default: 'Coat it like a pro, at home.' },
      { id: 'cta_label', type: 'text', label: 'Button text', default: 'Shop the kit' },
      { id: 'cta_url',   type: 'url',  label: 'Button URL',  default: '/shop' },
      ...CLASSES_FIELDS('Element keys: root, banner, title, button'),
    ]
  },
  {
    type: 'feature-columns',
    name: 'Feature Columns',
    settings: [
      {
        id: 'items', type: 'array', label: 'Features',
        itemSchema: [
          { id: 'icon',  type: 'text', label: 'Lucide icon', default: 'shield-check' },
          { id: 'title', type: 'text', label: 'Title',       default: 'Feature title' },
          { id: 'body',  type: 'text', label: 'Description', default: '' },
        ],
        default: []
      },
      ...CLASSES_FIELDS('Element keys: root, grid, item, item_icon, item_title, item_body'),
    ]
  },
  {
    type: 'review-carousel',
    name: 'Reviews',
    settings: [
      {
        id: 'items', type: 'array', label: 'Reviews',
        itemSchema: [
          { id: 'name',  type: 'text',   label: 'Reviewer name', default: '' },
          { id: 'stars', type: 'number', label: 'Stars (1-5)',   default: 5 },
          { id: 'title', type: 'text',   label: 'Review title',  default: '' },
          { id: 'body',  type: 'text',   label: 'Review text',   default: '' },
        ],
        default: []
      },
      ...CLASSES_FIELDS('Element keys: root, inner, scroll, card, card_title, card_body, card_author'),
    ]
  },
  {
    type: 'blog-grid',
    name: 'Blog Grid',
    settings: [
      {
        id: 'posts', type: 'array', label: 'Blog posts',
        itemSchema: [
          { id: 'tag',   type: 'text', label: 'Tag',        default: 'Guide' },
          { id: 'title', type: 'text', label: 'Title',      default: '' },
          { id: 'read',  type: 'text', label: 'Read time',  default: '3 min read' },
          { id: 'icon',  type: 'text', label: 'Lucide icon', default: 'droplets' },
          { id: 'url',   type: 'url',  label: 'Post URL',   default: '' },
        ],
        default: []
      },
      ...CLASSES_FIELDS('Element keys: root, grid, card, card_thumb, card_tag, card_body, card_title, card_meta'),
    ]
  },
  {
    type: 'faq-accordion',
    name: 'FAQ',
    settings: [
      { id: 'use_api_faqs', type: 'boolean', label: 'Load FAQs from store backend', default: true },
      {
        id: 'items', type: 'array', label: 'Manual FAQs (used when API is off)',
        itemSchema: [
          { id: 'q', type: 'text', label: 'Question', default: '' },
          { id: 'a', type: 'text', label: 'Answer',   default: '' },
        ],
        default: []
      },
      ...CLASSES_FIELDS('Element keys: root, list, item, item_question, item_answer'),
    ]
  },
  {
    type: 'newsletter-form',
    name: 'Newsletter',
    settings: [
      { id: 'btn_label', type: 'text', label: 'Button text', default: 'Subscribe' },
      ...CLASSES_FIELDS('Element keys: root, form, input, button'),
    ]
  },
  {
    type: 'page-hero',
    name: 'Page Hero',
    settings: [
      { id: 'title', type: 'text',         label: 'Heading', default: '' },
      { id: 'image', type: 'image_picker', label: 'Background image (optional)' },
      ...CLASSES_FIELDS('Element keys: root, inner, heading'),
    ]
  },
  {
    type: 'stats-grid',
    name: 'Stats Grid',
    settings: [
      {
        id: 'items', type: 'array', label: 'Stats',
        itemSchema: [
          { id: 'num',   type: 'text', label: 'Number / value', default: '' },
          { id: 'label', type: 'text', label: 'Label',          default: '' },
        ],
        default: []
      },
      ...CLASSES_FIELDS('Element keys: root, inner, card, card_num, card_label'),
    ]
  },
  {
    type: 'value-columns',
    name: 'Value Columns',
    settings: [
      {
        id: 'items', type: 'array', label: 'Values',
        itemSchema: [
          { id: 'icon',  type: 'text', label: 'Lucide icon', default: 'shield-check' },
          { id: 'title', type: 'text', label: 'Title',       default: '' },
          { id: 'body',  type: 'text', label: 'Description', default: '' },
        ],
        default: []
      },
      ...CLASSES_FIELDS('Element keys: root, inner, grid, item, item_icon, item_title, item_body'),
    ]
  },
  {
    type: 'contact-layout',
    name: 'Contact Form',
    settings: [
      { id: 'form_title',      type: 'text', label: 'Form heading',    default: 'Send a message' },
      { id: 'submit_label',    type: 'text', label: 'Submit button',   default: 'Send message' },
      { id: 'success_message', type: 'text', label: 'Success message', default: "Thanks! We'll get back to you shortly." },
      ...CLASSES_FIELDS('Element keys: root, form_wrap, form_title, form, input, button'),
    ]
  },
  {
    type: 'steps-list',
    name: 'Steps List',
    settings: [
      {
        id: 'items', type: 'array', label: 'Steps',
        itemSchema: [
          { id: 'n',     type: 'number', label: 'Step number', default: 1 },
          { id: 'icon',  type: 'text',   label: 'Lucide icon', default: 'droplets' },
          { id: 'title', type: 'text',   label: 'Title',       default: '' },
          { id: 'body',  type: 'text',   label: 'Description', default: '' },
        ],
        default: []
      },
      ...CLASSES_FIELDS('Element keys: root, inner, step, step_badge, step_line, step_content, step_icon, step_title, step_body'),
    ]
  },
  {
    type: 'track-form',
    name: 'Order Tracker',
    settings: [
      { id: 'placeholder_order', type: 'text', label: 'Order field placeholder', default: 'Order number' },
      { id: 'placeholder_email', type: 'text', label: 'Email field placeholder', default: 'Email (optional)' },
      { id: 'submit_label',      type: 'text', label: 'Submit button',           default: 'Track' },
      { id: 'hint_text',         type: 'text', label: 'Hint text',               default: "Find your order number in the confirmation email." },
      ...CLASSES_FIELDS('Element keys: root, form, input, button, result, timeline, step, hint'),
    ]
  },
  {
    type: 'custom-html',
    name: 'Custom HTML (legacy)',
    settings: [
      { id: 'html', type: 'richtext', label: 'HTML content', default: '<div style="padding:24px;text-align:center">Custom content here</div>' },
      ...CLASSES_FIELDS('Element keys: root'),
    ]
  },
  {
    type: 'custom-block',
    name: 'Custom Block',
    settings: [
      {
        id: 'elements',
        type: 'element_tree',
        label: 'Element tree',
        default: [
          {
            id: 'root',
            tag: 'div',
            text: '',
            attrs: { style: 'padding:48px 24px;text-align:center;background:#f8fafc' },
            children: [
              { id: 'h', tag: 'h2', text: 'Custom heading', attrs: { style: 'font-size:28px;font-weight:700;margin:0 0 12px' }, children: [] },
              { id: 'p', tag: 'p',  text: 'Add your content here.', attrs: { style: 'font-size:16px;color:#6b7280;margin:0' }, children: [] },
            ]
          }
        ]
      },
      ...CLASSES_FIELDS('Element keys: root'),
    ]
  },
  {
    type: 'data-block',
    name: 'Data Block (AI-designed)',
    settings: [
      {
        id: 'dataSource',
        type: 'select',
        label: 'Data source',
        default: 'static',
        options: [
          { value: 'static',     label: 'Static (no data)' },
          { value: 'products',   label: 'Products (from a collection)' },
          { value: 'categories', label: 'Product categories' },
          { value: 'faqs',       label: 'FAQs' },
          { value: 'company',    label: 'Company info' },
          { value: 'product',    label: 'Current product (product page)' },
        ],
        help: 'Determines what context variables are available in the element template',
      },
      { id: 'sectionKey', type: 'text',   label: 'Collection key (products only)', default: 'Bestsellers',
        help: 'Must match a section key from /bootstrap — e.g. "Bestsellers", "Featured products", "New launches"' },
      { id: 'limit',      type: 'number', label: 'Item limit (0 = all)', default: 0 },
      {
        id: 'elements',
        type: 'element_tree',
        label: 'Element template',
        default: [],
        help: 'Full HTML structure. Use {{item.name}}, {{item.priceFormatted}} etc. and data-repeat="items" for lists.',
      },
      ...CLASSES_FIELDS('Element keys: root'),
    ],
  },
]

export const schemaMap = Object.fromEntries(schemas.map(s => [s.type, s]))
