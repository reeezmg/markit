<script setup lang="ts">
import { ref, computed } from 'vue'
import { format } from 'date-fns'

import CashForm from '~/components/Cash/Form.vue'

import {
  useCreateCashAccount,
  useUpdateCashAccount,
  useDeleteCashAccount,
  useFindManyCashAccount,
} from '~/lib/hooks'

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   HOOKS
--------------------------------------------------- */
const createCash = useCreateCashAccount({ optimisticUpdate: true })
const updateCash = useUpdateCashAccount({ optimisticUpdate: true })
const deleteCash = useDeleteCashAccount({ optimisticUpdate: true })

/* ---------------------------------------------------
   MODAL STATE
--------------------------------------------------- */
const showCashForm = ref(false)
const selectedCash = ref<any | null>(null)

/* ---------------------------------------------------
   OPEN / CLOSE
--------------------------------------------------- */
const openCashForm = (row = null) => {
  selectedCash.value = row
  showCashForm.value = true
}

const closeCashForm = () => {
  showCashForm.value = false
  selectedCash.value = null
}

/* ---------------------------------------------------
   CREATE CASH
--------------------------------------------------- */
const addCash = () => {
  createCash.mutate({
    data: {
      name: 'Cash',
      company: {
        connect: {
          id: useAuth().session.value!.companyId,
        },
      },
    },
  })

  toast.add({ title: 'Cash account created', color: 'green' })
}

/* ---------------------------------------------------
   UPDATE CASH
--------------------------------------------------- */
const editCash = async (id: string, cash: any) => {
  await updateCash.mutateAsync({
    where: { id },
    data: {
      name: cash.name,
    },
  })

  toast.add({ title: 'Cash account updated', color: 'green' })
}

/* ---------------------------------------------------
   DELETE CASH (OPTIONAL)
--------------------------------------------------- */
const deleteCashRow = async (id: string) => {
  await deleteCash.mutateAsync({ where: { id } })
  toast.add({ title: 'Cash account deleted', color: 'green' })
}

/* ---------------------------------------------------
   SAVE HANDLER
--------------------------------------------------- */
const saveCash = async (form: any) => {
  if (selectedCash.value) {
    await editCash(selectedCash.value.id, form)
  } else {
    addCash()
  }
  closeCashForm()
}

/* ---------------------------------------------------
   FETCH DATA
--------------------------------------------------- */
const cashQuery = computed(() => ({
  where: { companyId: useAuth().session.value?.companyId },
}))

const { data: cashAccounts } = useFindManyCashAccount(cashQuery)

/* ---------------------------------------------------
   ROW
--------------------------------------------------- */
const cashAccount = computed(() => cashAccounts.value?.[0] ?? null)
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <!-- SUMMARY -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <UCard>
        <div class="text-sm text-gray-500">Cash Account</div>
        <div class="text-xl font-semibold">
          {{ cashAccount ? cashAccount.name : 'Not Created' }}
        </div>
      </UCard>
    </div>

    <!-- ACTIONS -->
    <div class="flex gap-2 mb-4">
      <UButton
        v-if="!cashAccount"
        color="primary"
        @click="openCashForm()"
      >
        Create Cash Account
      </UButton>

      <UButton
        v-else
        color="gray"
        @click="openCashForm(cashAccount)"
      >
        Edit Cash Account
      </UButton>

      <!-- Optional delete -->
      <UButton
        v-if="cashAccount"
        color="red"
        variant="soft"
        @click="deleteCashRow(cashAccount.id)"
      >
        Delete
      </UButton>
    </div>

    <!-- MODAL -->
    <UModal v-model="showCashForm">
      <CashForm
        :cash="selectedCash"
        @save="saveCash"
        @cancel="closeCashForm"
      />
    </UModal>
  </UDashboardPanelContent>
</template>
