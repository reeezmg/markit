<script setup lang="ts">
const toast = useToast()
const now = new Date()
const year = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth())
const addModalOpen = ref(false)
const isSaving = ref(false)
const form = reactive({ date: '', name: '' })

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const { data, pending, refresh } = await useAsyncData(
    'company-holidays',
    () => $fetch('/api/users/holidays', { query: { year: year.value } }),
    { watch: [year] },
)

const holidays = computed<any[]>(() => (data.value as any)?.holidays ?? [])
const dateKey = (value: Date | string) => {
    const d = new Date(value)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const holidaysByKey = computed(() => new Map(holidays.value.map((h: any) => [dateKey(h.date), h])))

const calendarDays = computed(() => {
    const first = new Date(year.value, selectedMonth.value, 1)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        const key = dateKey(d)
        return {
            date: d,
            key,
            day: d.getDate(),
            currentMonth: d.getMonth() === selectedMonth.value,
            today: key === dateKey(now),
            holiday: holidaysByKey.value.get(key),
        }
    })
})

const monthHolidayCount = (month: number) =>
    holidays.value.filter((h: any) => new Date(h.date).getMonth() === month).length

const openAdd = (date?: Date) => {
    const d = date ?? new Date(year.value, selectedMonth.value, now.getDate())
    form.date = dateKey(d)
    form.name = ''
    addModalOpen.value = true
}

const saveHoliday = async () => {
    if (!form.date) return toast.add({ title: 'Pick a date', color: 'red' })
    isSaving.value = true
    try {
        await $fetch('/api/users/holidays', {
            method: 'POST',
            body: { date: form.date, name: form.name || null },
        })
        toast.add({ title: 'Holiday saved', color: 'green' })
        addModalOpen.value = false
        await refresh()
    } catch (err: any) {
        toast.add({ title: 'Could not save holiday', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

const removeHoliday = async (holiday: any) => {
    try {
        await $fetch(`/api/users/holidays/${holiday.id}`, { method: 'DELETE' })
        toast.add({ title: 'Holiday removed', color: 'green' })
        await refresh()
    } catch (err: any) {
        toast.add({ title: 'Could not remove holiday', description: err?.data?.statusMessage || err?.message, color: 'red' })
    }
}

const markWeekday = async (weekday: number, label: string) => {
    try {
        const res: any = await $fetch('/api/users/holidays/bulk', {
            method: 'POST',
            body: { year: year.value, weekday },
        })
        toast.add({ title: `${label} marked`, description: `${res.count || 0} new holidays added`, color: 'green' })
        await refresh()
    } catch (err: any) {
        toast.add({ title: 'Could not mark holidays', description: err?.data?.statusMessage || err?.message, color: 'red' })
    }
}

const clearWeekends = async () => {
    try {
        const res: any = await $fetch('/api/users/holidays/bulk', {
            method: 'POST',
            body: { year: year.value, clearWeekends: true },
        })
        toast.add({ title: 'Weekends cleared', description: `${res.count || 0} holidays removed`, color: 'green' })
        await refresh()
    } catch (err: any) {
        toast.add({ title: 'Could not clear weekends', description: err?.data?.statusMessage || err?.message, color: 'red' })
    }
}

const prevMonth = () => {
    if (selectedMonth.value === 0) {
        selectedMonth.value = 11
        year.value--
    } else selectedMonth.value--
}
const nextMonth = () => {
    if (selectedMonth.value === 11) {
        selectedMonth.value = 0
        year.value++
    } else selectedMonth.value++
}
const goToday = () => {
    year.value = now.getFullYear()
    selectedMonth.value = now.getMonth()
}
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
                <h1 class="text-xl font-bold">Holidays - {{ year }}</h1>
                <p class="text-sm text-gray-500">Create and remove company holidays from the yearly calendar.</p>
            </div>
            <div class="flex items-center gap-2">
                <UButton icon="i-heroicons-chevron-left" color="gray" variant="soft" size="sm" @click="prevMonth" />
                <UButton label="Today" color="gray" variant="soft" size="sm" @click="goToday" />
                <UButton icon="i-heroicons-chevron-right" color="gray" variant="soft" size="sm" @click="nextMonth" />
            </div>
        </div>

        <div class="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr]">
            <div class="space-y-3">
                <UCard :ui="{ header: { padding: 'px-4 py-3' }, body: { padding: 'p-4' } }">
                    <template #header>
                        <div class="flex items-center justify-between">
                            <h3 class="text-sm font-semibold">Add/Remove Holidays</h3>
                            <UButton icon="i-heroicons-plus" size="xs" @click="openAdd()" />
                        </div>
                    </template>
                    <div class="space-y-4">
                        <UFormGroup label="Year">
                            <UInput v-model.number="year" type="number" min="2000" max="2100" />
                        </UFormGroup>
                        <div>
                            <div class="mb-2 text-xs font-semibold uppercase text-gray-500">Quick actions</div>
                            <div class="space-y-2">
                                <UButton block size="xs" color="gray" variant="soft" label="Mark all Fridays" @click="markWeekday(5, 'Fridays')" />
                                <UButton block size="xs" color="gray" variant="soft" label="Mark all Saturdays" @click="markWeekday(6, 'Saturdays')" />
                                <UButton block size="xs" color="gray" variant="soft" label="Mark all Sundays" @click="markWeekday(0, 'Sundays')" />
                                <UButton block size="xs" color="red" variant="soft" label="Clear weekends" @click="clearWeekends" />
                            </div>
                        </div>
                    </div>
                </UCard>

                <div class="overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
                    <button
                        v-for="(month, i) in monthNames"
                        :key="month"
                        type="button"
                        class="flex w-full items-center justify-between border-b border-gray-200 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                        :class="selectedMonth === i ? 'bg-primary-500 text-white hover:bg-primary-500 dark:hover:bg-primary-500' : ''"
                        @click="selectedMonth = i"
                    >
                        <span class="flex items-center gap-2">
                            <UIcon name="i-heroicons-calendar-days" />
                            {{ month }}
                        </span>
                        <UBadge v-if="monthHolidayCount(i)" color="gray" variant="subtle" size="xs">{{ monthHolidayCount(i) }}</UBadge>
                    </button>
                </div>
            </div>

            <UCard :ui="{ header: { padding: 'px-4 py-3' }, body: { padding: '' } }">
                <template #header>
                    <div class="flex items-center justify-between">
                        <h2 class="text-lg font-semibold">{{ monthNames[selectedMonth] }} {{ year }}</h2>
                        <UButton icon="i-heroicons-plus" label="Add holiday" size="sm" @click="openAdd()" />
                    </div>
                </template>

                <div v-if="pending" class="p-8 text-center text-sm text-gray-500">Loading holidays...</div>
                <div v-else>
                    <div class="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-[11px] font-semibold dark:border-gray-800 dark:bg-gray-900">
                        <div v-for="day in weekDays" :key="day" class="border-r border-gray-200 px-2 py-2 last:border-r-0 dark:border-gray-800">{{ day }}</div>
                    </div>
                    <div class="grid grid-cols-7">
                        <button
                            v-for="day in calendarDays"
                            :key="day.key"
                            type="button"
                            class="group min-h-[84px] border-b border-r border-gray-200 p-2 text-left last:border-r-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                            :class="!day.currentMonth ? 'bg-gray-50/60 text-gray-400 dark:bg-gray-950/40' : ''"
                            @click="day.holiday ? removeHoliday(day.holiday) : openAdd(day.date)"
                        >
                            <div class="flex items-start justify-between">
                                <span class="text-xs" :class="day.today ? 'font-bold text-primary-600' : ''">{{ day.day }}</span>
                                <UIcon v-if="day.holiday" name="i-heroicons-x-mark" class="hidden text-red-500 group-hover:block" />
                                <UIcon v-else name="i-heroicons-plus" class="hidden text-gray-400 group-hover:block" />
                            </div>
                            <div v-if="day.holiday" class="mt-3 inline-flex max-w-full rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                <span class="truncate">{{ day.holiday.name || 'Holiday' }}</span>
                            </div>
                        </button>
                    </div>
                </div>
            </UCard>
        </div>

        <UModal v-model="addModalOpen">
            <UCard :ui="{ header: { padding: 'px-4 py-4' } }">
                <template #header><h3 class="text-base font-semibold">Add holiday</h3></template>
                <div class="space-y-3">
                    <UFormGroup label="Date" required>
                        <UInput v-model="form.date" type="date" />
                    </UFormGroup>
                    <UFormGroup label="Name">
                        <UInput v-model="form.name" placeholder="Optional" />
                    </UFormGroup>
                </div>
                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" label="Cancel" @click="addModalOpen = false" />
                        <UButton :loading="isSaving" label="Save" @click="saveHoliday" />
                    </div>
                </template>
            </UCard>
        </UModal>
    </UDashboardPanelContent>
</template>
