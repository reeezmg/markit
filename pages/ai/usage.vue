<script setup lang="ts">
definePageMeta({ auth: true });

type UsageRow = {
  interactionId: string
  conversationId: string | null
  title: string | null
  status: string | null
  createdAt: string
  inputTokens: number
  outputTokens: number
  thoughtsTokens: number
  totalTokens: number
  billedInr: number
}

type UsageResponse = {
  rates: {
    inputUsdPerMillion: number
    outputUsdPerMillion: number
    usdToInr: number
    multiplier: number
    configured: boolean
  }
  totals: {
    runs: number
    inputTokens: number
    outputTokens: number
    thoughtsTokens: number
    cachedTokens: number
    totalTokens: number
    costUsd: number
    baseInr: number
    billedInr: number
  }
  daily: {
    day: string
    runs: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    billedInr: number
  }[]
  recent: UsageRow[]
}

const rangeOptions = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'All time', value: 'all' },
];
const range = ref('30');

const { data, pending, error, refresh } = await useFetch<UsageResponse>('/api/ai/usage', {
  query: { days: range },
});

const formatTokens = (value: number) => {
  if (!value) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

const formatInr = (value: number) => {
  if (!value) return '₹0.00';
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const kpiCards = computed(() => {
  const totals = data.value?.totals;
  return [
    {
      title: 'Total Tokens',
      value: formatTokens(totals?.totalTokens || 0),
      sub: `${totals?.runs || 0} agent run${totals?.runs === 1 ? '' : 's'}`,
      icon: 'i-heroicons-cpu-chip',
      accent: 'border-l-primary-500',
      textColor: 'text-gray-900 dark:text-white',
    },
    {
      title: 'Input Tokens',
      value: formatTokens(totals?.inputTokens || 0),
      sub: 'Prompts and repository context',
      icon: 'i-heroicons-arrow-down-tray',
      accent: 'border-l-blue-500',
      textColor: 'text-gray-900 dark:text-white',
    },
    {
      title: 'Output Tokens',
      value: formatTokens((totals?.outputTokens || 0) + (totals?.thoughtsTokens || 0)),
      sub: 'Replies and reasoning',
      icon: 'i-heroicons-arrow-up-tray',
      accent: 'border-l-amber-500',
      textColor: 'text-gray-900 dark:text-white',
    },
    {
      title: 'Cost',
      value: formatInr(totals?.billedInr || 0),
      sub: `${data.value?.rates.multiplier ?? 2.5}x of ${formatInr(totals?.baseInr || 0)}`,
      icon: 'i-heroicons-banknotes',
      accent: 'border-l-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];
});

const dailyColumns = [
  { key: 'day', label: 'Date' },
  { key: 'runs', label: 'Runs' },
  { key: 'inputTokens', label: 'Input' },
  { key: 'outputTokens', label: 'Output' },
  { key: 'totalTokens', label: 'Total' },
  { key: 'billedInr', label: 'Cost' },
];

type DailyEntry = UsageResponse['daily'][number];

const dailyRows = computed(() =>
  (data.value?.daily || []).map((entry: DailyEntry) => ({
    day: entry.day,
    runs: entry.runs,
    inputTokens: formatTokens(entry.inputTokens),
    outputTokens: formatTokens(entry.outputTokens),
    totalTokens: formatTokens(entry.totalTokens),
    billedInr: formatInr(entry.billedInr),
  })),
);

const recentColumns = [
  { key: 'title', label: 'Chat' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'When' },
  { key: 'totalTokens', label: 'Tokens' },
  { key: 'billedInr', label: 'Cost' },
];

const recentRows = computed(() =>
  (data.value?.recent || []).map((entry: UsageRow) => ({
    title: entry.title || 'Storefront chat',
    status: entry.status || '—',
    createdAt: new Date(entry.createdAt).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }),
    totalTokens: formatTokens(entry.totalTokens),
    billedInr: formatInr(entry.billedInr),
  })),
);
</script>

<template>
  <UDashboardPanelContent>
    <div class="space-y-6 p-4 md:p-6">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">AI Usage</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Tokens used by the storefront AI agent, and what they cost
          </p>
        </div>
        <div class="flex items-center gap-2">
          <USelectMenu
            v-model="range"
            :options="rangeOptions"
            value-attribute="value"
            option-attribute="label"
            class="w-40"
          />
          <UButton
            icon="i-heroicons-arrow-path"
            color="gray"
            variant="outline"
            :loading="pending"
            @click="refresh()"
          />
        </div>
      </div>

      <UAlert
        v-if="data && !data.rates.configured"
        icon="i-heroicons-exclamation-triangle"
        color="amber"
        variant="subtle"
        title="Token rates are not configured"
        description="Set AI_STOREFRONT_INPUT_USD_PER_M, AI_STOREFRONT_OUTPUT_USD_PER_M and AI_USD_TO_INR so cost can be calculated."
      />

      <UAlert
        v-if="error"
        icon="i-heroicons-exclamation-circle"
        color="red"
        variant="subtle"
        title="Could not load usage"
        :description="String(error)"
      />

      <!-- KPI skeleton -->
      <div v-if="pending && !data" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <USkeleton v-for="i in 4" :key="i" class="h-28 rounded-xl" />
      </div>

      <!-- KPI cards -->
      <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="card in kpiCards"
          :key="card.title"
          class="rounded-xl border-l-4 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex flex-col gap-1"
          :class="card.accent"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-none">
              {{ card.title }}
            </span>
            <UIcon :name="card.icon" class="w-4 h-4 text-gray-300 dark:text-gray-600" />
          </div>
          <span class="text-2xl font-bold truncate" :class="card.textColor">{{ card.value }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500">{{ card.sub }}</span>
        </div>
      </div>

      <div v-if="data?.totals.runs" class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- Daily breakdown -->
        <UCard :ui="{ body: { padding: '' }, header: { padding: 'px-4 py-3' } }">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 text-gray-400" />
              <span class="text-sm font-semibold">Usage by Day</span>
            </div>
          </template>
          <UTable :rows="dailyRows" :columns="dailyColumns" />
        </UCard>

        <!-- Recent runs -->
        <UCard :ui="{ body: { padding: '' }, header: { padding: 'px-4 py-3' } }">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-list-bullet" class="w-4 h-4 text-gray-400" />
              <span class="text-sm font-semibold">Recent Runs</span>
            </div>
          </template>
          <UTable :rows="recentRows" :columns="recentColumns" />
        </UCard>

      </div>

      <!-- Empty state -->
      <div
        v-if="!pending && !data?.totals.runs"
        class="flex flex-col items-center justify-center py-20 text-gray-400 gap-3"
      >
        <UIcon name="i-heroicons-cpu-chip" class="w-12 h-12 opacity-40" />
        <span class="text-sm">No AI usage recorded in this period</span>
      </div>

    </div>
  </UDashboardPanelContent>
</template>
