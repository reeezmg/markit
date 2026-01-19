<template>
  <UCard class="p-6">
    <UForm :state="form" @submit="saveForm">
      <div class="grid grid-cols-2 gap-4">

        <!-- Date -->
        <UFormGroup label="Date" required>
          <UInput v-model="form.date" type="date" />
        </UFormGroup>

        <!-- Investor (Company User) -->
        <UFormGroup label="Investor / Partner" required>
          <USelectMenu
            v-model="form.user"
            by="userId"
            :options="companyUsers"
            option-attribute="name"
            searchable
            placeholder="Select user"
          >
            <template #label>
              <div v-if="form.user">{{ form.user.name }}</div>
              <div v-else>Select user</div>
            </template>

            <template #option="{ option }">
              <div class="flex flex-col">
                <span class="font-medium">{{ option.name }}</span>
                <span class="text-xs opacity-70">{{ option.phone }}</span>
              </div>
            </template>
          </USelectMenu>
        </UFormGroup>

        <!-- Direction -->
        <UFormGroup label="Investment Type" required>
          <USelectMenu
            v-model="form.direction"
            :options="[
              { label: 'Capital Invested', value: 'IN' },
              { label: 'Capital Withdrawn', value: 'OUT' },
            ]"
          />
        </UFormGroup>

        <!-- Amount -->
        <UFormGroup label="Amount" required>
          <UInput
            v-model="form.amount"
            type="number"
            placeholder="0.00"
          />
        </UFormGroup>

        <!-- Payment Mode -->
        <UFormGroup label="Payment Mode" required>
          <USelectMenu
            v-model="form.paymentMode"
            :options="[
              { label: 'Cash', value: 'CASH' },
              { label: 'Bank', value: 'BANK' },
              { label: 'UPI', value: 'UPI' },
              { label: 'Card', value: 'CARD' },
              { label: 'Cheque', value: 'CHEQUE' },
            ]"
          />
        </UFormGroup>

        <!-- Status -->
        <UFormGroup label="Status">
          <USelectMenu
            v-model="form.status"
            :options="[
              { label: 'Completed', value: 'COMPLETED' },
              { label: 'Pending', value: 'PENDING' },
            ]"
          />
        </UFormGroup>

      </div>

      <!-- Note -->
      <UFormGroup label="Note" class="mt-4">
        <UTextarea
          v-model="form.note"
          placeholder="Optional note..."
        />
      </UFormGroup>

      <div class="flex justify-end mt-4">
        <UButton color="gray" @click="emit('cancel')">
          Cancel
        </UButton>
        <UButton color="primary" class="ml-3" type="submit">
          Save
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import { useFindManyCompanyUser } from '~/lib/hooks'

const props = defineProps({
  investment: {
    type: Object,
    required: false,
  },
})

const emit = defineEmits(['save', 'cancel'])
const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   FORM INITIALIZATION
--------------------------------------------------- */
const investmentData = computed(() => ({
  date: props.investment?.createdAt
    ? new Date(props.investment.createdAt).toLocaleDateString('en-CA')
    : new Date().toLocaleDateString('en-CA'),

  user: props.investment?.user || null,

  direction: props.investment?.direction || 'IN',
  amount: props.investment?.amount || '',

  paymentMode: props.investment?.paymentMode || 'CASH',
  status: props.investment?.status || 'COMPLETED',

  note: props.investment?.note || '',
}))

const form = ref({ ...investmentData.value })

/* ---------------------------------------------------
   FETCH COMPANY USERS (INVESTOR)
--------------------------------------------------- */
const userQueryArgs = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,
    deleted: false,
  },
  select: {
    userId: true,
    name: true,
    phone: true,
  },
}))

const { data: companyUsers } = useFindManyCompanyUser(userQueryArgs)

/* ---------------------------------------------------
   SAVE FORM
--------------------------------------------------- */
const saveForm = () => {
  if (!form.value.user?.userId) {
    toast.add({
      title: 'Please select investor',
      color: 'red',
    })
    return
  }

  if (!form.value.amount || Number(form.value.amount) <= 0) {
    toast.add({
      title: 'Please enter valid amount',
      color: 'red',
    })
    return
  }

  emit('save', {
    date: form.value.date,
    userId: form.value.user.userId,
    direction: form.value.direction,
    amount: Number(form.value.amount),
    paymentMode: form.value.paymentMode.value || form.value.paymentMode,
    status: form.value.status,
    note: form.value.note,
  })
}
</script>
