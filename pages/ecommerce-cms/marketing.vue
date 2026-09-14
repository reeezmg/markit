<script setup lang="ts">
type Campaign = { id: string; name: string; subject: string; segment: string; status: string; scheduledAt?: string | null; createdAt: string;
  sentCount: number; failedCount: number; pendingCount: number }
type Automation = { kind: string; enabled: boolean; delayHours: number; subject: string; body: string }
type Overview = { campaigns: Campaign[]; automations: Automation[]; jobCounts: { status: string; count: number }[];
  segmentCounts: Record<string, number>; failedJobs: { id: string; email: string; attempts: number; lastError?: string | null; eventKey: string }[] }

const toast = useToast()
const request = $fetch as unknown as (url: string, options?: Record<string, unknown>) => Promise<unknown>
const { data, pending, error, refresh } = await useFetch<Overview>('/api/ecommerce-cms/marketing', {
  default: () => ({ campaigns: [], automations: [], jobCounts: [], segmentCounts: {}, failedJobs: [] }),
})
const saving = ref(false)
const form = reactive({ name: '', subject: '', body: '', segment: 'all', scheduledAt: '' })
const automationForms = reactive<Record<string, Automation>>({
  abandoned_cart: { kind: 'abandoned_cart', enabled: false, delayHours: 24, subject: 'You left something in your cart', body: 'Hi {name}, your cart is waiting for you.' },
  post_purchase: { kind: 'post_purchase', enabled: false, delayHours: 72, subject: 'Thank you for your order', body: 'Hi {name}, thank you for shopping with us.' },
})
watch(data, (value) => {
  for (const rule of value?.automations || []) if (automationForms[rule.kind]) Object.assign(automationForms[rule.kind], rule)
}, { immediate: true })

async function createCampaign() {
  saving.value = true
  try {
    await request('/api/ecommerce-cms/marketing/campaigns', { method: 'POST', body: { ...form,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined } })
    Object.assign(form, { name: '', subject: '', body: '', segment: 'all', scheduledAt: '' })
    await refresh()
    toast.add({ title: 'Draft campaign saved' })
  } catch (e: any) { toast.add({ title: 'Could not save campaign', description: e?.data?.statusMessage || e.message, color: 'red' }) }
  finally { saving.value = false }
}
async function campaignAction(id: string, action: 'queue' | 'cancel') {
  try {
    await request(`/api/ecommerce-cms/marketing/campaigns/${id}/${action}`, { method: 'POST' })
    await refresh()
    toast.add({ title: action === 'queue' ? 'Campaign queued' : 'Campaign cancelled' })
  } catch (e: any) { toast.add({ title: 'Action failed', description: e?.data?.statusMessage || e.message, color: 'red' }) }
}
async function saveAutomation(kind: string) {
  saving.value = true
  try {
    await request('/api/ecommerce-cms/marketing/automations', { method: 'PUT', body: automationForms[kind] })
    await refresh()
    toast.add({ title: 'Automation saved' })
  } catch (e: any) { toast.add({ title: 'Could not save automation', description: e?.data?.statusMessage || e.message, color: 'red' }) }
  finally { saving.value = false }
}
</script>

<template>
  <div class="space-y-8 p-4 sm:p-6">
    <div><h1 class="text-2xl font-semibold">Email marketing</h1>
      <p class="text-sm text-gray-500">Only customers who confirmed their email subscription can receive these messages. Every email includes an unsubscribe link.</p></div>
    <p v-if="error" class="text-red-600">Marketing data could not load. Manager access is required.</p>
    <p v-else-if="pending">Loading marketing data…</p>
    <template v-else>
      <section class="space-y-3"><h2 class="text-lg font-semibold">Eligible segments</h2>
        <div class="flex flex-wrap gap-2"><span v-for="name in ['all','new','repeat','inactive','cart']" :key="name" class="rounded-lg border px-3 py-2 text-sm capitalize">{{ name }}: {{ data?.segmentCounts?.[name] || 0 }}</span></div>
        <p class="text-xs text-gray-500">New: no orders · Repeat: at least 2 orders · Inactive: last order over 90 days ago · Cart: saved non-empty cart. Counts can overlap.</p>
      </section>

      <section class="space-y-4 rounded-xl border p-4 dark:border-gray-700"><h2 class="text-lg font-semibold">Create campaign draft</h2>
        <form class="grid gap-3" @submit.prevent="createCampaign">
          <input v-model="form.name" required maxlength="100" placeholder="Internal campaign name" class="rounded border bg-transparent px-3 py-2">
          <input v-model="form.subject" required maxlength="180" placeholder="Email subject" class="rounded border bg-transparent px-3 py-2">
          <textarea v-model="form.body" required maxlength="10000" rows="5" placeholder="Plain-text message. Use {name} for the customer's name." class="rounded border bg-transparent px-3 py-2" />
          <div class="flex flex-wrap gap-3"><label class="text-sm">Segment <select v-model="form.segment" class="rounded border bg-transparent px-2 py-1"><option v-for="name in ['all','new','repeat','inactive','cart']" :key="name" :value="name">{{ name }}</option></select></label>
            <label class="text-sm">Send after <input v-model="form.scheduledAt" type="datetime-local" class="rounded border bg-transparent px-2 py-1"></label></div>
          <p class="text-xs text-gray-500">Saving creates a draft only. Use Queue below to authorize sending.</p>
          <button :disabled="saving" type="submit" class="w-fit rounded bg-primary-500 px-4 py-2 text-white disabled:opacity-50">Save draft</button>
        </form>
      </section>

      <section class="space-y-3"><h2 class="text-lg font-semibold">Campaigns</h2>
        <p v-if="!data?.campaigns.length" class="text-sm text-gray-500">No campaigns yet.</p>
        <div v-for="campaign in data?.campaigns" :key="campaign.id" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 dark:border-gray-700">
          <div><p class="font-medium">{{ campaign.name }} <span class="text-xs uppercase text-gray-500">{{ campaign.status }}</span></p>
            <p class="text-sm text-gray-500">{{ campaign.subject }} · {{ campaign.segment }} · {{ campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : 'Now when queued' }}</p>
            <p class="text-xs text-gray-500">Sent {{ campaign.sentCount }} · Pending {{ campaign.pendingCount }} · Failed {{ campaign.failedCount }}</p></div>
          <div class="flex gap-2"><button v-if="campaign.status === 'DRAFT'" class="rounded border px-3 py-1 text-sm" @click="campaignAction(campaign.id, 'queue')">Queue</button>
            <button v-if="['DRAFT','QUEUED','ENQUEUED'].includes(campaign.status)" class="rounded border px-3 py-1 text-sm text-red-600" @click="campaignAction(campaign.id, 'cancel')">Stop remaining</button></div>
        </div>
      </section>

      <section class="space-y-4"><h2 class="text-lg font-semibold">Lifecycle automations</h2>
        <div v-for="kind in ['abandoned_cart','post_purchase']" :key="kind" class="grid gap-3 rounded-xl border p-4 dark:border-gray-700">
          <h3 class="font-medium">{{ kind === 'abandoned_cart' ? 'Abandoned cart' : 'Post-purchase follow-up' }}</h3>
          <label class="flex items-center gap-2 text-sm"><input v-model="automationForms[kind].enabled" type="checkbox"> Enabled</label>
          <label class="text-sm">Delay (hours) <input v-model.number="automationForms[kind].delayHours" type="number" min="1" max="720" class="ml-2 w-20 rounded border bg-transparent px-2 py-1"></label>
          <input v-model="automationForms[kind].subject" maxlength="180" placeholder="Subject" class="rounded border bg-transparent px-3 py-2">
          <textarea v-model="automationForms[kind].body" maxlength="10000" rows="3" placeholder="Plain-text message" class="rounded border bg-transparent px-3 py-2" />
          <button :disabled="saving" class="w-fit rounded bg-primary-500 px-4 py-2 text-white disabled:opacity-50" @click="saveAutomation(kind)">Save automation</button>
        </div>
      </section>
      <section><h2 class="text-lg font-semibold">Delivery status</h2>
        <div class="flex flex-wrap gap-2 text-sm"><span v-for="item in data?.jobCounts" :key="item.status" class="rounded border px-3 py-1">{{ item.status }}: {{ item.count }}</span></div>
        <div v-if="data?.failedJobs.length" class="mt-3 space-y-2"><h3 class="text-sm font-medium">Recent failed deliveries</h3>
          <p v-for="job in data.failedJobs" :key="job.id" class="rounded border p-2 text-xs dark:border-gray-700">{{ job.email }} · {{ job.eventKey }} · {{ job.attempts }} attempts · {{ job.lastError || 'Unknown error' }}</p>
        </div>
      </section>
    </template>
  </div>
</template>
