<script setup lang="ts">
const companyScope = useCompanyScope('table');
const $fetch = companyScope.fetch;

const toast = useToast()
const now = new Date()
const year = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth())
const addModalOpen = ref(false)
const isSaving = ref(false)
const form = reactive({ id: '', companyId: '', date: '', name: '' })
const canManage = computed(() => ['admin', 'manager', 'accountant'].includes(companyScope.auth.session.value?.role || ''))
const deleting = ref(false)
const deleteTarget = ref<any>(null)
const deleteOpen = ref(false)
const yearOptions = Array.from({ length: 101 }, (_, i) => 2000 + i)

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const { data, pending, error, refresh } = await useAsyncData(
    computed(() => 'company-holidays:' + year.value + ':' + companyScope.readIds.value.join(',')),
    () => $fetch('/api/users/holidays', { query: { year: year.value } }),
    { watch: [year, companyScope.readIds] },
)

const holidays = computed<any[]>(() => (data.value as any)?.holidays ?? [])
const dateKey = (value: Date | string) => {
    const d = new Date(value)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const holidaysByKey = computed(() => { const days = new Map<string, any[]>(); for (const h of holidays.value) { const key = dateKey(h.date); days.set(key, [...(days.get(key) || []), h]); } return days; })

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
            holidays: holidaysByKey.value.get(key) || [],
        }
    })
})

const monthHolidayCount = (month: number) =>
    new Set(holidays.value.filter((h: any) => new Date(h.date).getMonth() === month).map(h => dateKey(h.date))).size

const openAdd = async (date?: Date) => {
    if (!canManage.value) return
    await companyScope.beginForm();
    const d = date ?? new Date(year.value, selectedMonth.value, Math.min(new Date().getDate(), new Date(year.value, selectedMonth.value + 1, 0).getDate()))
    form.id = ''
    form.companyId = ''
    form.date = dateKey(d)
    form.name = ''
    addModalOpen.value = true
}

const openEdit = async (holiday: any) => {
    if (!canManage.value) return
    await companyScope.beginForm()
    await companyScope.selectOwner(holiday.companyId)
    Object.assign(form, { id: holiday.id, companyId: holiday.companyId, date: dateKey(holiday.date), name: holiday.name || '' })
    addModalOpen.value = true
}
const saveHoliday = async () => {
    if (isSaving.value || companyScope.busy.value || !canManage.value) return
    if (!form.date) return toast.add({ title: 'Pick a date', color: 'red' })
    isSaving.value = true
    try {
        await $fetch(form.id ? `/api/users/holidays/${form.id}` : '/api/users/holidays', {
            method: form.id ? 'PUT' : 'POST',
            ...(form.id ? { headers: { 'x-company-id': form.companyId } } : {}),
            body: { date: form.date, name: form.name || null },
        })
        toast.add({ title: 'Holiday saved', color: 'green' })
        addModalOpen.value = false
        const savedDate = new Date(`${form.date}T00:00:00`)
        year.value = savedDate.getFullYear()
        selectedMonth.value = savedDate.getMonth()
        await refresh()
    } catch (err: any) {
        toast.add({ title: 'Could not save holiday', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

const confirmDelete = (holiday: any) => {
    deleteTarget.value = holiday
    deleteOpen.value = true
}
const removeHoliday = async () => {
    if (deleting.value || !deleteTarget.value || !canManage.value) return
    deleting.value = true
    try {
        const holiday = deleteTarget.value
        await $fetch(`/api/users/holidays/${holiday.id}`, { method: 'DELETE', headers: { 'x-company-id': holiday.companyId } })
        deleteOpen.value = false
        toast.add({ title: 'Holiday removed', color: 'green' })
        await refresh()
    } catch (err: any) {
        toast.add({ title: 'Could not remove holiday', description: err?.data?.statusMessage || err?.message, color: 'red' })
    } finally { deleting.value = false }
}

const prevMonth = () => {
    if (year.value === 2000 && selectedMonth.value === 0) return
    if (selectedMonth.value === 0) {
        selectedMonth.value = 11
        year.value--
    } else selectedMonth.value--
}
const nextMonth = () => {
    if (year.value === 2100 && selectedMonth.value === 11) return
    if (selectedMonth.value === 11) {
        selectedMonth.value = 0
        year.value++
    } else selectedMonth.value++
}
const goToday = () => {
    const today = new Date()
    year.value = today.getFullYear()
    selectedMonth.value = today.getMonth()
}
</script>

<template>
    <UDashboardPanelContent class="p-4 space-y-4">
        <CompanyTableFilter />
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h1 class="text-xl font-bold">Company holidays</h1>
                <p class="text-sm text-gray-500">Plan festivals, public holidays and company closure dates.</p>
            </div>
            <UButton v-if="canManage" icon="i-heroicons-plus" label="Add holiday" :disabled="companyScope.busy.value" @click="openAdd()" />
        </div>
        <UAlert icon="i-heroicons-information-circle" title="How holidays affect attendance and pay" description="This calendar sets holiday dates. Each employee's shift controls whether the holiday is paid and the compensation for working that day. After changing dates, rerun affected payroll cycles to update saved calculations." />
        <div class="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div class="space-y-4">
                <UCard>
                    <UFormGroup label="Calendar year">
                        <USelect :model-value="year" @update:model-value="year = Number($event)" :options="yearOptions" />
                    </UFormGroup>
                    <div class="mt-4 grid grid-cols-3 gap-1 lg:grid-cols-1">
                        <UButton v-for="(month, index) in monthNames" :key="month" :color="selectedMonth === index ? 'primary' : 'gray'" :variant="selectedMonth === index ? 'soft' : 'ghost'" :aria-pressed="selectedMonth === index" class="justify-between" @click="selectedMonth = index">
                            <span>{{ month }}</span><span v-if="monthHolidayCount(index)" class="text-xs">{{ monthHolidayCount(index) }}</span>
                        </UButton>
                    </div>
                </UCard>
                <UCard>
                    <h2 class="font-semibold text-sm">Regular weekly offs</h2>
                    <p class="mt-2 text-sm text-gray-500">Set recurring days off, such as every Sunday, in Shift > Work days. Adding them here applies holiday rules instead.</p>
                    <UButton to="/users/shift" label="Open shift settings" variant="link" class="mt-2 px-0" />
                    <p class="mt-2 text-xs text-gray-500">Previously added weekly holidays remain here. Review and remove them individually if they should use weekly-off rules.</p>
                </UCard>
            </div>
            <div class="space-y-4 min-w-0">
                <UCard>
                    <template #header>
                        <div class="flex flex-wrap justify-between items-center gap-2">
                            <h2 class="font-semibold">{{ monthNames[selectedMonth] }} {{ year }}</h2>
                            <div class="flex gap-2">
                                <UButton icon="i-heroicons-chevron-left" aria-label="Previous month" color="gray" variant="ghost" :disabled="year === 2000 && selectedMonth === 0" @click="prevMonth" />
                                <UButton label="Today" color="gray" variant="soft" @click="goToday" />
                                <UButton icon="i-heroicons-chevron-right" aria-label="Next month" color="gray" variant="ghost" :disabled="year === 2100 && selectedMonth === 11" @click="nextMonth" />
                            </div>
                        </div>
                    </template>
                    <div v-if="error" class="space-y-2" role="alert">
                        <p class="text-sm text-red-500">Could not load holidays. Please try again.</p>
                        <UButton label="Retry" color="gray" @click="refresh()" />
                    </div>
                    <p v-else-if="pending" class="py-12 text-center text-sm text-gray-500" role="status">Loading holidays...</p>
                    <div v-else class="overflow-x-auto">
                        <div class="min-w-[560px]">
                            <div class="grid grid-cols-7 mb-2 text-center text-xs font-medium text-gray-500">
                                <div v-for="day in weekDays" :key="day">{{ day }}</div>
                            </div>
                            <div class="grid grid-cols-7 gap-1">
                                <div v-for="day in calendarDays" :key="day.key" class="min-h-[96px] rounded-lg border p-2" :class="[day.currentMonth ? 'border-gray-200 dark:border-gray-800' : 'border-transparent bg-gray-50 dark:bg-gray-900', day.today ? 'ring-1 ring-primary-500' : '']">
                                    <template v-if="day.currentMonth">
                                        <button v-if="canManage" type="button" class="w-full text-left text-sm rounded focus-visible:ring-2 focus-visible:ring-primary-500" :aria-label="`Add holiday on ${day.key}`" @click="openAdd(day.date)">{{ day.day }}<span class="float-right text-gray-400" aria-hidden="true">+</span></button>
                                        <span v-else class="text-sm">{{ day.day }}</span>
                                        <div v-for="holiday in day.holidays" :key="holiday.id" class="mt-2 rounded bg-emerald-50 p-1 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                            <button v-if="canManage" type="button" class="w-full text-left break-words rounded focus-visible:ring-2 focus-visible:ring-primary-500" :aria-label="`Edit ${holiday.name || 'holiday'} on ${day.key}`" @click="openEdit(holiday)">{{ holiday.name || 'Company holiday' }}</button>
                                            <span v-else class="break-words">{{ holiday.name || 'Company holiday' }}</span>
                                            <p v-if="holiday.companyName" class="mt-1 text-[10px] opacity-75">{{ holiday.companyName }}</p>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </UCard>
                <UCard v-if="!pending && !error">
                    <template #header><h2 class="font-semibold text-sm">Holidays this month - {{ monthHolidayCount(selectedMonth) }} dates</h2></template>
                    <p v-if="!monthHolidayCount(selectedMonth)" class="text-sm text-gray-500">No holidays added for this month. Regular weekly offs are managed in shifts.</p>
                    <ul v-else class="divide-y divide-gray-100 dark:divide-gray-800">
                        <li v-for="holiday in holidays.filter(h => new Date(h.date).getMonth() === selectedMonth)" :key="holiday.id" class="flex items-center justify-between gap-3 py-3">
                            <div><p class="font-medium text-sm">{{ holiday.name || 'Company holiday' }}</p><p class="text-xs text-gray-500">{{ dateKey(holiday.date) }}<span v-if="holiday.companyName"> - {{ holiday.companyName }}</span></p></div>
                            <div v-if="canManage" class="flex gap-1">
                                <UButton label="Edit" color="gray" variant="ghost" size="xs" @click="openEdit(holiday)" />
                                <UButton label="Delete" color="red" variant="ghost" size="xs" @click="confirmDelete(holiday)" />
                            </div>
                        </li>
                    </ul>
                </UCard>
            </div>
        </div>
        <UModal v-model="addModalOpen" :prevent-close="isSaving" aria-labelledby="holiday-editor-title">
            <UCard>
                <template #header><h2 id="holiday-editor-title" class="font-semibold">{{ form.id ? 'Edit holiday' : 'Add holiday' }}</h2></template>
                <form id="holiday-form" class="space-y-4" @submit.prevent="saveHoliday">
                    <CompanyFormField :locked="!!form.id || isSaving" />
                    <UFormGroup label="Holiday date" required help="The date this company observes the holiday. Each company can have one holiday entry per date.">
                        <UInput v-model="form.date" type="date" required min="2000-01-01" max="2100-12-31" :disabled="isSaving" />
                    </UFormGroup>
                    <UFormGroup label="Holiday name" help="Optional. Use a name your staff will recognize, such as Diwali or Company anniversary.">
                        <UInput v-model="form.name" placeholder="e.g. Diwali" :maxlength="120" :disabled="isSaving" />
                    </UFormGroup>
                    <p class="text-xs text-gray-500">Pay and compensation follow each employee's shift settings.</p>
                </form>
                <template #footer><div class="flex justify-end gap-2">
                    <UButton label="Cancel" color="gray" variant="ghost" :disabled="isSaving" @click="addModalOpen = false" />
                    <UButton type="submit" form="holiday-form" :label="form.id ? 'Save changes' : 'Add holiday'" :loading="isSaving" :disabled="companyScope.busy.value" />
                </div></template>
            </UCard>
        </UModal>
        <UModal v-model="deleteOpen" :prevent-close="deleting" aria-labelledby="holiday-delete-title">
            <UCard>
                <template #header><h2 id="holiday-delete-title" class="font-semibold">Delete holiday?</h2></template>
                <p class="text-sm">Remove {{ deleteTarget?.name || 'Company holiday' }} on {{ deleteTarget ? dateKey(deleteTarget.date) : '' }}<span v-if="deleteTarget?.companyName"> from {{ deleteTarget.companyName }}</span>?</p>
                <p class="mt-2 text-sm text-gray-500">This changes how the date is treated in attendance and future payroll calculations. Rerun affected payroll cycles to update saved results.</p>
                <template #footer><div class="flex justify-end gap-2">
                    <UButton label="Keep holiday" color="gray" variant="ghost" :disabled="deleting" @click="deleteOpen = false" />
                    <UButton label="Delete holiday" color="red" :loading="deleting" @click="removeHoliday" />
                </div></template>
            </UCard>
        </UModal>
    </UDashboardPanelContent>
</template>
