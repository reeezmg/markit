<script setup lang="ts">
import { format } from 'date-fns';
type Column = {
    key: string;
    label: string;
    type?: 'money' | 'signed' | 'number' | 'date';
};
const props = withDefaults(
    defineProps<{
        rows: Record<string, any>[];
        columns: Column[];
        caption: string;
        empty?: string;
        total?: Record<string, any>;
        currency?: string;
    }>(),
    { empty: 'No activity in this period.', currency: 'INR' }
);
function display(value: any, column: Column) {
    if (column.type === 'date')
        return value ? format(new Date(value), 'dd MMM yyyy') : '—';
    if (column.type === 'money' || column.type === 'signed') {
        const amount = Number(value || 0);
        return (
            (column.type === 'signed' && amount > 0 ? '+' : '') +
            new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: props.currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(amount)
        );
    }
    if (column.type === 'number')
        return Number(value || 0).toLocaleString('en-IN');
    return value ?? '—';
}
function tone(value: any, column: Column) {
    if (!['money', 'signed'].includes(column.type || '')) return '';
    return Number(value) < 0
        ? 'text-rose-600 dark:text-rose-400'
        : column.type === 'signed' && Number(value) > 0
        ? 'text-emerald-700 dark:text-emerald-400'
        : '';
}
</script>
<template>
    <div class="max-h-96 overflow-auto rounded-b-xl">
        <table class="w-full text-sm">
            <caption class="sr-only">{{ caption }}</caption>
            <thead class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <tr
                    ><th
                        v-for="column in columns"
                        :key="column.key"
                        scope="col"
                        class="whitespace-nowrap border-y border-gray-200 px-4 py-3 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400"
                        :class="
                            column.type && column.type !== 'date'
                                ? 'text-right'
                                : 'text-left'
                        "
                        >{{ column.label }}</th
                    ></tr
                >
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr
                    v-for="(row, index) in rows"
                    :key="row.id || index"
                    class="hover:bg-gray-50/70 dark:hover:bg-gray-800/40"
                >
                    <td
                        v-for="column in columns"
                        :key="column.key"
                        class="px-4 py-3"
                        :class="[
                            column.type && column.type !== 'date'
                                ? 'whitespace-nowrap text-right tabular-nums'
                                : 'text-left',
                            tone(row[column.key], column),
                        ]"
                    >
                        <NuxtLink
                            v-if="column.key === 'name' && row.href"
                            :to="row.href"
                            class="font-medium text-gray-900 underline decoration-gray-200 underline-offset-4 hover:text-primary-600 dark:text-gray-100 dark:decoration-gray-700"
                            >{{ display(row[column.key], column) }}</NuxtLink
                        >
                        <span v-else>{{
                            display(row[column.key], column)
                        }}</span>
                    </td>
                </tr>
                <tr v-if="!rows.length"
                    ><td
                        :colspan="columns.length"
                        class="px-4 py-8 text-center text-sm text-gray-500"
                        >{{ empty }}</td
                    ></tr
                >
            </tbody>
            <tfoot
                v-if="total"
                class="border-t border-gray-200 bg-gray-50 font-semibold dark:border-gray-800 dark:bg-gray-900"
            >
                <tr
                    ><td
                        v-for="column in columns"
                        :key="column.key"
                        class="px-4 py-3"
                        :class="[
                            column.type && column.type !== 'date'
                                ? 'whitespace-nowrap text-right tabular-nums'
                                : 'text-left',
                            tone(total[column.key], column),
                        ]"
                        >{{ display(total[column.key], column) }}</td
                    ></tr
                >
            </tfoot>
        </table>
    </div>
</template>
