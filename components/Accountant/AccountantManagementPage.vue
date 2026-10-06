<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ config.title }}
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ config.description }}</p>
      </div>
      <div class="flex gap-2">
        <USelectMenu
          v-if="view === 'account-transactions'"
          v-model="accountFilter"
          :options="accountOptions"
          value-attribute="id"
          placeholder="All accounts"
          class="w-64"
        />
        <UButton
          v-if="config.action"
          icon="i-lucide-plus"
          @click="openCreate"
          >{{ config.action }}</UButton
        >
      </div>
    </div>

    <template v-if="view === 'preferences'">
      <UCard
        ><form
          class="grid gap-4 md:grid-cols-2"
          @submit.prevent="savePreferences"
        >
          <UFormGroup label="Fiscal year starts in month (1–12)"><UInput v-model.number="preference.fyStartMonth" type="number" min="1" max="12" /></UFormGroup>
          <UFormGroup label="Recurring journal child status"
            ><USelect
              v-model="preference.recurringChildStatus"
              :options="['DRAFT', 'PUBLISHED']"
              class="w-full"
          /></UFormGroup>
          <UFormGroup label="Journal approval"
            ><USelect
              v-model="preference.journalApprovalType"
              :options="['NONE', 'SIMPLE', 'MULTI_LEVEL']"
              class="w-full"
          /></UFormGroup>
          <UCheckbox
            v-model="preference.allowThirteenthMonth"
            label="Enable thirteenth-month adjustments"
          />
          <UCheckbox
            v-model="preference.allowSelfApproval"
            label="Allow self approval"
          />
          <UFormGroup label="Unrealized gain account"
            ><USelectMenu
              v-model="preference.unrealizedGainAccountId"
              :options="accountOptions"
              value-attribute="id"
              class="w-full"
          /></UFormGroup>
          <UFormGroup label="Unrealized loss account"
            ><USelectMenu
              v-model="preference.unrealizedLossAccountId"
              :options="accountOptions"
              value-attribute="id"
              class="w-full"
          /></UFormGroup>
          <div class="md:col-span-2 flex justify-end">
            <UButton type="submit" :loading="saving">Save preferences</UButton>
          </div>
        </form></UCard
      >
    </template>

    <template v-else-if="view === 'budget-actual'">
      <div class="flex gap-2">
        <USelectMenu
          v-model="budgetId"
          :options="budgetOptions"
          value-attribute="id"
          placeholder="Select budget"
          class="w-72"
        />
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <UCard
          ><p class="text-xs text-gray-500 dark:text-gray-400">Budget</p>
          <p class="text-xl font-bold">
            {{ money(budgetTotals.budget) }}
          </p></UCard
        ><UCard
          ><p class="text-xs text-gray-500 dark:text-gray-400">Actual</p>
          <p class="text-xl font-bold">
            {{ money(budgetTotals.actual) }}
          </p></UCard
        ><UCard
          ><p class="text-xs text-gray-500 dark:text-gray-400">Variance</p>
          <p class="text-xl font-bold">
            {{ money(budgetTotals.budget - budgetTotals.actual) }}
          </p></UCard
        >
      </div>
      <DataTable :columns="['Account', 'Budget', 'Actual', 'Variance']"
        ><tr
          v-for="row in budgetRows"
          :key="row.accountId"
          class="border-t border-gray-200 dark:border-gray-700"
        >
          <td class="px-3 py-2">{{ accountName(row.accountId) }}</td>
          <td class="px-3 py-2 text-right">{{ money(row.budget) }}</td>
          <td class="px-3 py-2 text-right">{{ money(row.actual) }}</td>
          <td class="px-3 py-2 text-right">
            {{ money(row.budget - row.actual) }}
          </td>
        </tr></DataTable
      >
    </template>

    <template v-else>
      <DataTable :columns="config.columns">
        <tr v-for="row in rows" :key="row.id" class="border-t border-gray-200 dark:border-gray-700">
          <td
            v-for="column in config.keys"
            :key="column"
            class="px-3 py-2"
            :class="{ 'text-right': amountKeys.includes(column) }"
          >
            {{ column === 'purchasePayment' ? (row.purchasePayment ? `Paid ${row.purchasePayment.amount} · ${row.purchasePayment.method} · ${String(row.purchasePayment.date).slice(0,10)}${row.purchasePayment.reference ? ' · '+row.purchasePayment.reference : ''}` : 'Registered only') : display(row, column) }}
          </td>
          <td v-if="hasActions" class="px-3 py-2 text-right">
            <div class="flex justify-end gap-1">
              <UButton v-if="['base-currency', 'currency-adjustments'].includes(view) && row.status === 'DRAFT'" size="xs" variant="ghost" @click="publishAdjustment(row)">Publish</UButton>
              <UButton
                v-if="view === 'recurring-journals'"
                size="xs"
                variant="ghost"
                @click="generate(row)"
                >Generate</UButton
              >
              <UButton
                v-if="view === 'recurring-journals'"
                size="xs"
                variant="ghost"
                @click="toggleRecurring(row)"
                >{{ row.status === "ACTIVE" ? "Stop" : "Resume" }}</UButton
              >
              <UButton
                v-if="view === 'transaction-locking' && row.isLocked"
                size="xs"
                variant="ghost"
                @click="unlock(row)"
                >Unlock</UButton
              >
              <UButton
                v-if="
                  view === 'reverse-journals' &&
                  !row.reversedFromId &&
                  !(row.reversals || []).length
                "
                size="xs"
                variant="ghost"
                @click="reverse(row)"
                >Reverse now</UButton
              >
              <UButton
                v-if="view === 'fixed-assets' && row.status === 'ACTIVE'"
                size="xs"
                variant="ghost"
                @click="startAssetAction(row, 'depreciate')"
                >Depreciate</UButton
              >
              <UButton
                v-if="
                  view === 'fixed-assets' &&
                  ['ACTIVE', 'FULLY_DEPRECIATED'].includes(row.status)
                "
                size="xs"
                variant="ghost"
                @click="startAssetAction(row, 'dispose')"
                >Dispose</UButton
              >
            </div>
          </td>
        </tr>
      </DataTable>
      <div
        v-if="!rows.length && !loading"
        class="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-10 text-center text-sm text-gray-500 dark:text-gray-400"
      >
        No {{ config.title.toLowerCase() }} found.
      </div>
    </template>

    <AccountantModal v-model="createOpen" :title="config.action || actionTitle"
      ><template #body
        ><form class="space-y-4" @submit.prevent="save">
          <template
            v-if="
              [
                'journal-templates',
                'recurring-journals',
                'thirteenth-month',
              ].includes(view)
            "
          >
            <UFormGroup v-if="view === 'journal-templates'" label="Template amounts"><USelect v-model="form.templateMode" :options="['AMOUNT', 'PERCENTAGE']" /></UFormGroup>
            <UFormGroup
              :label="
                view === 'recurring-journals'
                  ? 'Profile name'
                  : view === 'journal-templates'
                    ? 'Template name'
                    : 'Fiscal year'
              "
              ><UInput
                v-if="view !== 'thirteenth-month'"
                v-model="
                  form[view === 'recurring-journals' ? 'profileName' : 'name']
                "
                class="w-full" /><UInput
                v-else
                v-model.number="form.fiscalYear"
                type="number"
                class="w-full"
            /></UFormGroup>
            <div
              v-if="view === 'recurring-journals'"
              class="grid gap-3 sm:grid-cols-3"
            >
              <UFormGroup label="Frequency"
                ><USelect
                  v-model="form.frequency"
                  :options="['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']"
                  class="w-full" /></UFormGroup
              ><UFormGroup label="Every"
                ><UInput
                  v-model.number="form.repeatEvery"
                  type="number"
                  min="1" /></UFormGroup
              ><UFormGroup label="Child status"
                ><USelect
                  v-model="form.childStatus"
                  :options="['DRAFT', 'PUBLISHED']"
                  class="w-full" /></UFormGroup
              ><UFormGroup label="Start date"
                ><UInput v-model="form.startDate" type="date" /></UFormGroup
              ><UFormGroup label="End date"
                ><UInput v-model="form.endDate" type="date"
              /></UFormGroup>
            </div>
            <div
              v-if="view === 'thirteenth-month'"
              class="grid gap-3 sm:grid-cols-2"
            >
              <UFormGroup label="Adjustment date"
                ><UInput
                  v-model="form.journalDate"
                  type="date"
                  class="w-full" /></UFormGroup
              ><UFormGroup label="Status"
                ><USelect
                  v-model="form.status"
                  :options="['DRAFT', 'PUBLISHED']"
                  class="w-full"
              /></UFormGroup>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormGroup label="Reference"
                ><UInput
                  v-model="form.referenceNumber"
                  class="w-full" /></UFormGroup
              ><UFormGroup label="Reporting method"
                ><USelect
                  v-model="form.journalType"
                  :options="['BOTH', 'CASH', 'ACCRUAL']"
                  class="w-full"
              /></UFormGroup>
            </div>
            <JournalLines v-model="form.lines" :accounts="accountOptions" />
          </template>
          <template v-else-if="view === 'budgets'"
            ><div class="grid gap-3 sm:grid-cols-3">
              <UFormGroup label="Budget name"
                ><UInput v-model="form.name" /></UFormGroup
              ><UFormGroup label="Fiscal year"
                ><UInput
                  v-model.number="form.fiscalYear"
                  type="number" /></UFormGroup
              ><UFormGroup label="Period"
                ><USelect
                  v-model="form.periodType"
                  :options="['MONTHLY', 'QUARTERLY', 'YEARLY']"
              /></UFormGroup>
            </div>
            <div
              v-for="line in form.allocations"
              :key="line.key"
              class="grid grid-cols-[1fr_9rem_auto] gap-2"
            >
              <USelectMenu
                v-model="line.accountId"
                :options="accountOptions"
                value-attribute="id"
              /><UInput
                v-model.number="line.amount"
                type="number"
                min="0"
                step="0.01"
              /><UButton
                icon="i-lucide-x"
                color="gray"
                variant="ghost"
                @click="removeLine(form.allocations, line)"
              />
            </div>
            <UButton
              size="sm"
              variant="soft"
              @click="
                form.allocations.push({
                  key: Math.random(),
                  accountId: '',
                  amount: 0,
                })
              "
              >Add account</UButton
            ></template
          >
          <template v-else-if="view === 'transaction-locking'"
            ><UFormGroup label="Module"
              ><USelect
                v-model="form.module"
                :options="['ALL', 'BANKING', 'ACCOUNTS']"
                class="w-full" /></UFormGroup
            ><UFormGroup label="Lock through"
              ><UInput
                v-model="form.lockDate"
                type="date"
                class="w-full" /></UFormGroup
          ></template>
          <template v-else-if="view === 'opening-balances'"
            ><UFormGroup label="Account"
              ><USelectMenu
                v-model="form.accountId"
                :options="accountOptions"
                value-attribute="id"
                class="w-full"
            /></UFormGroup>
            <div class="grid gap-3 sm:grid-cols-3">
              <UFormGroup label="As of"
                ><UInput v-model="form.asOfDate" type="date" /></UFormGroup
              ><UFormGroup label="Side"
                ><USelect
                  v-model="form.side"
                  :options="['DEBIT', 'CREDIT']" /></UFormGroup
              ><UFormGroup label="Amount"
                ><UInput
                  v-model.number="form.amount"
                  type="number"
                  min="0.01"
                  step="0.01"
              /></UFormGroup></div
          ></template>
          <template v-else-if="view === 'asset-categories'"
            ><UFormGroup label="Category name"
              ><UInput v-model="form.name" class="w-full" /></UFormGroup
            ><AccountField
              v-model="form.assetAccountId"
              label="Fixed asset account"
              :options="accountOptions" /><AccountField
              v-model="form.accumulatedDepAccountId"
              label="Accumulated depreciation account"
              :options="accountOptions" /><AccountField
              v-model="form.depreciationExpenseAccountId"
              label="Depreciation expense account"
              :options="accountOptions" />
            <div class="grid gap-3 sm:grid-cols-3">
              <UFormGroup label="Method"
                ><USelect
                  v-model="form.depreciationMethod"
                  :options="[
                    'STRAIGHT_LINE',
                    'DECLINING_BALANCE',
                    'NONE',
                  ]" /></UFormGroup
              ><UFormGroup label="Life (months)"
                ><UInput
                  v-model.number="form.usefulLifeMonths"
                  type="number"
                  min="1" /></UFormGroup
              ><UFormGroup label="Salvage %"
                ><UInput
                  v-model.number="form.salvagePercentage"
                  type="number"
                  min="0"
                  max="100"
              /></UFormGroup></div
          ></template>
          <template v-else-if="view === 'fixed-assets' && !assetAction"
            ><div class="grid gap-3 sm:grid-cols-2">
              <UFormGroup label="Asset name"
                ><UInput v-model="form.name" /></UFormGroup
              ><UFormGroup label="Category"
                ><USelectMenu
                  v-model="form.categoryId"
                  :options="categoryOptions"
                  value-attribute="id" /></UFormGroup
              ><UFormGroup label="Purchase date"
                ><UInput v-model="form.purchaseDate" type="date" /></UFormGroup
              ><UFormGroup label="Available for use"
                ><UInput
                  v-model="form.availableForUseDate"
                  type="date" /></UFormGroup
              ><UFormGroup label="Cost"
                ><UInput
                  v-model.number="form.purchaseCost"
                  type="number"
                  min="0.01" /></UFormGroup
              ><UFormGroup label="Salvage value"
                ><UInput
                  v-model.number="form.salvageValue"
                  type="number"
                  min="0" /></UFormGroup
              ><UFormGroup label="Life (months)"
                ><UInput
                  v-model.number="form.usefulLifeMonths"
                  type="number"
                  min="1" /></UFormGroup
              ><UFormGroup label="Method"
                ><USelect
                  v-model="form.depreciationMethod"
                  :options="[
                    'STRAIGHT_LINE',
                    'DECLINING_BALANCE',
                    'NONE',
                  ]" /></UFormGroup
              ><UFormGroup label="Serial number"
                ><UInput v-model="form.serialNumber" /></UFormGroup
              ><UFormGroup label="Location"
                ><UInput v-model="form.location"
              /></UFormGroup>
              <UFormGroup label="Vendor (optional)"><USelectMenu v-model="form.vendorId" :options="vendorOptions" value-attribute="id" option-attribute="label" searchable placeholder="Select contact" /></UFormGroup>
              <div class="sm:col-span-2 border-t pt-3 space-y-3">
                <UCheckbox v-model="form.recordPayment" label="Record purchase payment" />
                <p v-if="!form.recordPayment" class="text-xs text-gray-500">Register only if this purchase is already recorded in accounts. No purchase or payment journal will be added.</p>
                <template v-else>
                  <p class="text-xs text-gray-500">Records the full cost of {{ form.purchaseCost }} as paid and posts the asset purchase. Use the cost above for the total amount paid.</p>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <UFormGroup label="Payment amount"><UInput :model-value="form.purchaseCost" disabled /></UFormGroup>
                    <UFormGroup label="Payment type" required><USelect v-model="form.paymentMethod" :options="['CASH','BANK','UPI','CARD','CHEQUE']" /></UFormGroup>
                    <AccountField v-model="form.paymentAccountId" label="Paid from" :options="assetPaymentOptions" />
                    <UFormGroup label="Payment date" required><UInput v-model="form.paymentDate" type="date" :min="form.purchaseDate" required /></UFormGroup>
                    <UFormGroup label="Payment / invoice reference"><UInput v-model="form.paymentReference" maxlength="150" /></UFormGroup>
                    <AccountField v-if="form.paymentDate > form.purchaseDate" v-model="form.purchasePayableAccountId" label="Purchase payable account" :options="assetPayableOptions" />
                  </div>
                </template>
              </div></div
          ></template>
          <template
            v-else-if="['base-currency', 'currency-adjustments'].includes(view)"
            ><div class="grid gap-3 sm:grid-cols-2">
              <UFormGroup label="Date"
                ><UInput
                  v-model="form.adjustmentDate"
                  type="date" /></UFormGroup
              ><UFormGroup label="Currency"
                ><UInput v-model="form.currency" maxlength="3" /></UFormGroup
              ><AccountField
                v-model="form.accountId"
                label="Foreign-currency account"
                :options="accountOptions"
              /><AccountField
                v-model="form.gainLossAccountId"
                label="Gain / loss account"
                :options="accountOptions"
              /><UFormGroup label="Foreign balance"
                ><UInput
                  v-model.number="form.foreignBalance"
                  type="number"
                  step="0.01" /></UFormGroup
              ><UFormGroup label="New exchange rate"
                ><UInput
                  v-model.number="form.exchangeRate"
                  type="number"
                  step="0.000001" /></UFormGroup
              ><UFormGroup label="Current base balance"
                ><UInput
                  v-model.number="form.baseBalanceBefore"
                  type="number"
                  step="0.01" /></UFormGroup
              ><UCheckbox
                v-model="form.publish"
                label="Post adjustment now"
              /></div
          ></template>
          <template v-else-if="view === 'manage-clients'"
            ><UFormGroup label="Customer"
              ><USelectMenu
                v-model="form.partyId"
                :options="customerOptions"
                value-attribute="id"
                class="w-full"
            /></UFormGroup>
            <div class="grid gap-3 sm:grid-cols-3">
              <UFormGroup label="Service"
                ><USelect
                  v-model="form.serviceType"
                  :options="[
                    'BOOKKEEPING',
                    'TAX',
                    'AUDIT',
                    'FULL_SERVICE',
                  ]" /></UFormGroup
              ><UFormGroup label="Access"
                ><USelect
                  v-model="form.accessLevel"
                  :options="['VIEWER', 'ACCOUNTANT', 'ADMIN']" /></UFormGroup
              ><UFormGroup label="Fiscal year end month"
                ><UInput
                  v-model.number="form.fiscalYearEndMonth"
                  type="number"
                  min="1"
                  max="12"
              /></UFormGroup></div
          ></template>
          <template v-else-if="view === 'bulk-updates'"
            ><UFormGroup label="Accounts"
              ><USelectMenu
                v-model="form.accountIds"
                multiple
                :options="accountOptions"
                value-attribute="id"
                class="w-full"
            /></UFormGroup>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormGroup label="Status"
                ><USelect
                  v-model="form.statusChoice"
                  :options="['UNCHANGED', 'ACTIVE', 'INACTIVE']" /></UFormGroup
              ><UFormGroup label="Dashboard"
                ><USelect
                  v-model="form.dashboardChoice"
                  :options="['UNCHANGED', 'SHOW', 'HIDE']"
              /></UFormGroup></div
          ></template>
          <template v-else-if="assetAction === 'depreciate'"
            ><UFormGroup label="Depreciation date"
              ><UInput
                v-model="form.date"
                type="date"
                class="w-full" /></UFormGroup
          ></template>
          <template v-else-if="assetAction === 'dispose'"
            ><div class="grid gap-3 sm:grid-cols-2">
              <UFormGroup label="Disposal date"
                ><UInput v-model="form.disposalDate" type="date" /></UFormGroup
              ><UFormGroup label="Method"
                ><USelect
                  v-model="form.disposalMethod"
                  :options="['SALE', 'SCRAP', 'WRITE_OFF']" /></UFormGroup
              ><UFormGroup label="Proceeds"
                ><UInput
                  v-model.number="form.proceeds"
                  type="number"
                  min="0" /></UFormGroup
              ><AccountField
                v-model="form.proceedsAccountId"
                label="Proceeds account"
                :options="accountOptions"
              /><AccountField
                v-model="form.gainLossAccountId"
                label="Gain / loss account"
                :options="accountOptions"
              /></div
          ></template>
          <UFormGroup
            v-if="!['bulk-updates', 'asset-categories'].includes(view)"
            label="Notes / reason"
            ><UTextarea v-model="form.notes" class="w-full"
          /></UFormGroup>
          <div class="flex justify-end">
            <UButton type="submit" :loading="saving">Save</UButton>
          </div>
        </form></template
      ></AccountantModal
    >
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
const api = useAccountantApi();
import DataTable from "./SimpleTable.vue";

const AccountField = defineComponent({
  props: { modelValue: String, label: String, options: Array },
  emits: ["update:modelValue"],
  setup(p, { emit }) {
    return () =>
      h(resolveComponent("UFormGroup") as any, { label: p.label }, () =>
        h(resolveComponent("USelectMenu") as any, {
          modelValue: p.modelValue,
          options: p.options,
          valueAttribute: "id",
          class: "w-full",
          "onUpdate:modelValue": (v: string) => emit("update:modelValue", v),
        }),
      );
  },
});
const JournalLines = defineComponent({
  props: { modelValue: { type: Array, required: true }, accounts: Array },
  emits: ["update:modelValue"],
  setup(p: any, { emit }) {
    const change = (i: number, k: string, v: any) => {
      const a = p.modelValue.map((x: any) => ({ ...x }));
      a[i][k] = v;
      emit("update:modelValue", a);
    };
    return () =>
      h("div", { class: "space-y-2" }, [
        h("div", { class: "text-sm font-medium" }, "Journal lines"),
        ...p.modelValue.map((line: any, i: number) =>
          h("div", { class: "grid grid-cols-[1fr_7rem_8rem_auto] gap-2" }, [
            h(resolveComponent("USelectMenu") as any, {
              modelValue: line.accountId,
              options: p.accounts,
              valueAttribute: "id",
              "onUpdate:modelValue": (v: string) => change(i, "accountId", v),
            }),
            h(resolveComponent("USelect") as any, {
              modelValue: line.side,
              options: ["DEBIT", "CREDIT"],
              "onUpdate:modelValue": (v: string) => change(i, "side", v),
            }),
            h(resolveComponent("UInput") as any, {
              modelValue: line.amount,
              type: "number",
              min: 0.01,
              step: 0.01,
              "onUpdate:modelValue": (v: any) => change(i, "amount", Number(v)),
            }),
            h(resolveComponent("UButton") as any, {
              icon: "i-lucide-x",
              variant: "ghost",
              color: "gray",
              onClick: () =>
                emit(
                  "update:modelValue",
                  p.modelValue.filter((_: any, n: number) => n !== i),
                ),
            }),
          ]),
        ),
        h(
          resolveComponent("UButton") as any,
          {
            size: "sm",
            variant: "soft",
            onClick: () =>
              emit("update:modelValue", [
                ...p.modelValue,
                { accountId: "", side: "DEBIT", amount: 0 },
              ]),
          },
          () => "Add line",
        ),
      ]);
  },
});
import { resolveComponent } from "vue";
const route = useRoute(),
  qc = useQueryClient(),
  toast = useToast(),
  view = computed(() => String(route.params.view || "account-details"));
const configs: any = {
  "account-details": {
    title: "Account Details",
    description: "Review account configuration, hierarchy and ledger usage.",
    columns: ["Account", "Code", "Type", "Parent", "Balance", "Transactions"],
    keys: [
      "name",
      "code",
      "accountType",
      "parent.name",
      "balance",
      "_count.journalLines",
    ],
  },
  "sub-accounts": {
    title: "Sub-accounts",
    description: "Review the five-level account hierarchy used across reports.",
    columns: ["Account", "Type", "Parent", "Children"],
    keys: ["name", "accountType", "parent.name", "children.length"],
  },
  "account-transactions": {
    title: "Account Transactions",
    description: "Published debit and credit activity from the general ledger.",
    columns: [
      "Date",
      "Journal",
      "Account",
      "Debit / Credit",
      "Amount",
      "Description",
    ],
    keys: [
      "journal.journalDate",
      "journal.entryNumber",
      "account.name",
      "side",
      "amount",
      "description",
    ],
  },
  "journal-templates": {
    title: "Journal Templates",
    description:
      "Reusable balanced journal structures with amounts or percentages.",
    action: "New template",
    columns: ["Template", "Reporting Method", "Currency", "Mode", "Status"],
    keys: ["name", "journalType", "currency", "templateMode", "isActive"],
  },
  "recurring-journals": {
    title: "Recurring Journals",
    description:
      "Schedule balanced child journals and control draft or published posting.",
    action: "New recurring profile",
    columns: [
      "Profile",
      "Frequency",
      "Next Run",
      "Child Status",
      "Status",
      "Actions",
    ],
    keys: ["profileName", "frequency", "nextRunDate", "childStatus", "status"],
  },
  "reverse-journals": {
    title: "Reverse Journals",
    description:
      "Scheduled and completed reversals for published manual journals.",
    columns: [
      "Journal",
      "Date",
      "Scheduled Reversal",
      "Reversed From",
      "Status",
      "Actions",
    ],
    keys: [
      "entryNumber",
      "journalDate",
      "reversalDate",
      "reversedFrom.entryNumber",
      "reversals.length",
    ],
  },
  "journal-credits": {
    title: "Journal Credits",
    description: "Credit-side entries across published journals.",
    columns: ["Date", "Journal", "Account", "Reference", "Amount"],
    keys: [
      "journal.journalDate",
      "journal.entryNumber",
      "account.name",
      "journal.referenceNumber",
      "amount",
    ],
  },
  "base-currency": {
    title: "Base-currency Adjustments",
    description:
      "Revalue foreign account balances against the organization base currency.",
    action: "New base-currency adjustment",
    columns: ["Number", "Date", "Currency", "Rate", "Gain / Loss", "Status"],
    keys: [
      "adjustmentNumber",
      "adjustmentDate",
      "currency",
      "exchangeRate",
      "gainLoss",
      "status",
    ],
  },
  "thirteenth-month": {
    title: "Thirteenth-month Adjustment Journals",
    description: "Year-end adjustment entries kept in the final fiscal month.",
    action: "New year-end adjustment",
    columns: ["Journal", "Date", "Reference", "Total", "Status"],
    keys: ["entryNumber", "journalDate", "referenceNumber", "total", "status"],
  },
  budgets: {
    title: "Budgets",
    description:
      "Plan account-level amounts by fiscal year and reporting period.",
    action: "New budget",
    columns: ["Budget", "Fiscal Year", "Period", "Status", "Notes"],
    keys: ["name", "fiscalYear", "periodType", "status", "notes"],
  },
  "transaction-locking": {
    title: "Transaction Locking",
    description:
      "Freeze modules through a date while retaining unlock reasons and history.",
    action: "New lock",
    columns: [
      "Module",
      "Lock Through",
      "Reason",
      "Status",
      "Unlocked At",
      "Actions",
    ],
    keys: ["module", "lockDate", "reason", "isLocked", "unlockedAt"],
  },
  "opening-balances": {
    title: "Opening Balances",
    description:
      "Post traceable opening balances through Opening Balance Adjustments.",
    action: "Set opening balance",
    columns: ["Account", "As Of", "Side", "Amount", "Currency", "Journal"],
    keys: ["accountId", "asOfDate", "side", "amount", "currency", "journalId"],
  },
  "fixed-assets": {
    title: "Fixed Assets",
    description:
      "Register assets and manage their depreciation and disposal lifecycle.",
    action: "New fixed asset",
    columns: [
      "Asset",
      "Name",
      "Cost",
      "Accumulated Depreciation",
      "Book Value",
      "Status",
      "Purchase payment",
      "Actions",
    ],
    keys: [
      "assetNumber",
      "name",
      "purchaseCost",
      "accumulatedDepreciation",
      "bookValue",
      "status",
      "purchasePayment",
    ],
  },
  "asset-categories": {
    title: "Asset Categories",
    description:
      "Map asset, accumulated depreciation and expense accounts to a depreciation policy.",
    action: "New asset category",
    columns: ["Category", "Method", "Life (months)", "Salvage %", "Status"],
    keys: [
      "name",
      "depreciationMethod",
      "usefulLifeMonths",
      "salvagePercentage",
      "isActive",
    ],
  },
  depreciation: {
    title: "Depreciation",
    description:
      "Posted depreciation schedule with journal-linked book values.",
    columns: ["Date", "Asset", "Amount", "Accumulated", "Book Value", "Status"],
    keys: [
      "depreciationDate",
      "assetId",
      "amount",
      "accumulatedAfter",
      "bookValueAfter",
      "status",
    ],
  },
  "asset-disposal": {
    title: "Asset Disposal",
    description:
      "Sale, scrap and write-off history with calculated gain or loss.",
    columns: ["Date", "Asset", "Method", "Proceeds", "Gain / Loss", "Journal"],
    keys: [
      "disposalDate",
      "assetId",
      "disposalMethod",
      "proceeds",
      "gainLoss",
      "journalId",
    ],
  },
  "currency-adjustments": {
    title: "Currency Adjustments",
    description:
      "Revalue foreign-currency accounts and post realized accounting effects.",
    action: "New currency adjustment",
    columns: ["Number", "Date", "Type", "Currency", "Gain / Loss", "Status"],
    keys: [
      "adjustmentNumber",
      "adjustmentDate",
      "adjustmentType",
      "currency",
      "gainLoss",
      "status",
    ],
  },
  "bulk-updates": {
    title: "Bulk Updates",
    description:
      "Apply controlled status and dashboard changes to multiple accounts.",
    action: "Update accounts",
    columns: ["Account", "Code", "Type", "Status", "Dashboard"],
    keys: ["name", "code", "accountType", "isActive", "showOnDashboard"],
  },
  "manage-clients": {
    title: "Manage Clients",
    description:
      "Link customer records to bookkeeping, tax and audit engagements.",
    action: "Add accountant client",
    columns: [
      "Client",
      "Email",
      "Service",
      "Access",
      "Fiscal Year End",
      "Status",
    ],
    keys: [
      "party.name",
      "party.email",
      "serviceType",
      "accessLevel",
      "fiscalYearEndMonth",
      "engagementStatus",
    ],
  },
  preferences: {
    title: "Accountant Preferences",
    description:
      "Configure journal automation, approvals, year-end entries and gain/loss accounts.",
  },
  "budget-actual": {
    title: "Budget versus Actual",
    description:
      "Compare planned amounts with published ledger activity by account.",
  },
};
const config = computed(() => configs[view.value]);
const endpoint = computed(
  () =>
    (
      ({
        "transaction-locking": "transaction-locks",
        "base-currency": "currency-adjustments?type=BASE_CURRENCY",
        "currency-adjustments":
          "currency-adjustments?type=CURRENCY_REVALUATION",
        "thirteenth-month": "thirteenth-month-journals",
        "asset-disposal": "asset-disposals",
        "bulk-updates": "account-details",
        "manage-clients": "clients",
      }) as any
    )[view.value] || view.value,
);
const accountFilter = ref(""),
  budgetId = ref(""),
  createOpen = ref(false),
  saving = ref(false),
  assetAction = ref(""),
  selectedAsset = ref<any>(null),
  form = reactive<any>({}),
  preference = reactive<any>({});
const bootstrapQ = useQuery<any>({
  queryKey: ["accountant-v2", api.companyId, "accountant-bootstrap"],
  queryFn: () => api.get("/accountant-management/bootstrap"),
});
const query = useQuery<any>({
  queryKey: ["accountant-v2", api.companyId, "accountant", view, accountFilter],
  queryFn: () =>
    api.get(
      `/accountant-management/${endpoint.value}${view.value === "account-transactions" && accountFilter.value ? `?accountId=${accountFilter.value}` : ""}`,
    ),
  enabled: computed(
    () => !["preferences", "budget-actual"].includes(view.value),
  ),
});
const preferenceQ = useQuery<any>({
  queryKey: ["accountant-v2", api.companyId, "accountant-preferences"],
  queryFn: () => api.get("/accountant-management/preferences"),
  enabled: computed(() => ['preferences', 'recurring-journals'].includes(view.value)),
});
const budgetsQ = useQuery<any>({
  queryKey: ["accountant-v2", api.companyId, "accountant-budgets"],
  queryFn: () => api.get("/accountant-management/budgets"),
  enabled: computed(() => view.value === "budget-actual"),
});
const budgetActualQ = useQuery<any>({
  queryKey: ["accountant-v2", api.companyId, "accountant-budget-actual", budgetId],
  queryFn: () =>
    api.get(`/accountant-management/budgets/${budgetId.value}/actual`),
  enabled: computed(() => !!budgetId.value),
});
const categoryQ = useQuery<any>({
  queryKey: ["accountant-v2", api.companyId, "accountant-asset-categories"],
  queryFn: () => api.get("/accountant-management/asset-categories"),
});
const rows = computed(() => query.data.value?.data || []),
  loading = computed(() => query.isLoading.value),
  accounts = computed(() => bootstrapQ.data.value?.accounts || []),
  accountOptions = computed(() =>
    accounts.value.map((x: any) => ({
      id: x.id,
      label: `${x.code ? x.code + " - " : ""}${x.name}`,
    })),
  ),
  customerOptions = computed(() =>
    (bootstrapQ.data.value?.parties || [])
      .filter((x: any) => x.type === "CLIENT")
      .map((x: any) => ({ id: x.id, label: x.name })),
  ),
  categoryOptions = computed(() =>
    (categoryQ.data.value?.data || []).map((x: any) => ({
      id: x.id,
      label: x.name,
    })),
  );
const assetPurchaseDefaults = ref<Record<string,string>>({});
const vendorOptions = computed(() => (bootstrapQ.data.value?.parties || []).map((p:any) => ({ id: p.id, label: p.name })));
const assetPaymentOptions = computed(() => accountOptions.value.filter((o:any) => accounts.value.find((a:any) => a.id === o.id)?.accountType === (form.paymentMethod === 'CASH' ? 'CASH' : 'BANK')));
const assetPayableOptions = computed(() => accountOptions.value.filter((o:any) => accounts.value.find((a:any) => a.id === o.id)?.accountType === 'ACCOUNTS_PAYABLE'));
watch(() => form.paymentMethod, () => {
  if (view.value !== 'fixed-assets' || assetAction.value) return;
  if (!assetPaymentOptions.value.some((o:any) => o.id === form.paymentAccountId)) form.paymentAccountId = assetPurchaseDefaults.value[form.paymentMethod === 'CASH' ? 'cash' : 'bank'] || '';
});
const budgetOptions = computed(() =>
  (budgetsQ.data.value?.data || []).map((x: any) => ({
    id: x.id,
    label: `${x.name} (${x.fiscalYear})`,
  })),
);
const budgetRows = computed(() => {
  const b = budgetActualQ.data.value?.budget;
  if (!b) return [];
  const actual = budgetActualQ.data.value.actual || {};
  return (b.allocations || []).map((x: any) => ({
    accountId: x.accountId,
    budget: (x.periods || []).reduce((s: number, n: any) => s + Number(n), 0),
    actual: (actual[x.accountId] || []).reduce(
      (s: number, n: any) => s + Number(n),
      0,
    ),
  }));
});
const budgetTotals = computed(() =>
  budgetRows.value.reduce(
    (s: any, x: any) => ({
      budget: s.budget + x.budget,
      actual: s.actual + x.actual,
    }),
    { budget: 0, actual: 0 },
  ),
);
const amountKeys = [
  "amount",
  "total",
  "purchaseCost",
  "accumulatedDepreciation",
  "bookValue",
  "accumulatedAfter",
  "bookValueAfter",
  "proceeds",
  "gainLoss",
  "balance",
];
const hasActions = computed(() =>
  [
    "recurring-journals",
    "transaction-locking",
    "reverse-journals",
    "fixed-assets",
    "base-currency", "currency-adjustments",
  ].includes(view.value),
);
const actionTitle = computed(() =>
  assetAction.value === "dispose" ? "Dispose asset" : "Post depreciation",
);
const today = () => new Date().toISOString().slice(0, 10),
  accountName = (id: string) =>
    accounts.value.find((x: any) => x.id === id)?.name || id || "—",
  money = (v: any) =>
    Number(v || 0).toLocaleString("en-IN", {
      style: "currency",
      currency: bootstrapQ.data.value?.company?.currency || "INR",
    }),
  nice = (v: any) =>
    String(v ?? "—")
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
function get(row: any, path: string) {
  return path
    .split(".")
    .reduce((x, k) => (k === "length" ? (x?.length ?? 0) : x?.[k]), row);
}
function display(row: any, key: string) {
  const v = get(row, key);
  if (key.endsWith("accountId") || key === "assetId") return accountName(v);
  if (amountKeys.includes(key)) return money(v);
  if (/Date|At/.test(key) && v) return new Date(v).toLocaleDateString("en-IN");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return nice(v);
}
function reset() {
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, {
    journalType: "BOTH",
    templateMode: 'AMOUNT',
    currency: bootstrapQ.data.value?.company?.currency || "INR",
    exchangeRate: 1,
    lines: [
      { accountId: "", side: "DEBIT", amount: 0 },
      { accountId: "", side: "CREDIT", amount: 0 },
    ],
    frequency: "MONTHLY",
    repeatEvery: 1,
    startDate: today(),
    childStatus: preferenceQ.data.value?.recurringChildStatus || 'DRAFT',
    status: "DRAFT",
    fiscalYear: new Date().getFullYear(),
    journalDate: today(),
    periodType: "MONTHLY",
    allocations: [{ key: Math.random(), accountId: "", amount: 0 }],
    module: "ACCOUNTS",
    lockDate: today(),
    asOfDate: today(),
    side: "DEBIT",
    amount: 0,
    depreciationMethod: "STRAIGHT_LINE",
    usefulLifeMonths: 60,
    salvagePercentage: 0,
    purchaseDate: today(),
    availableForUseDate: today(),
    purchaseCost: 0,
    recordPayment: false,
    paymentMethod: 'CASH',
    paymentDate: today(),
    paymentAccountId: '',
    purchasePayableAccountId: '',
    paymentReference: '',
    salvageValue: 0,
    adjustmentDate: today(),
    adjustmentType:
      view.value === "base-currency" ? "BASE_CURRENCY" : "CURRENCY_REVALUATION",
    foreignBalance: 0,
    baseBalanceBefore: 0,
    publish: false,
    serviceType: "BOOKKEEPING",
    accessLevel: "ACCOUNTANT",
    fiscalYearEndMonth: 3,
    statusChoice: "UNCHANGED",
    dashboardChoice: "UNCHANGED",
    accountIds: [],
    notes: "",
  });
}
async function openCreate() {
  assetAction.value = "";
  reset();
  if (view.value === 'fixed-assets') {
    form.requestId = crypto.randomUUID();
    const settings = await api.get('/account-settings/defaults');
    assetPurchaseDefaults.value = settings.defaults.purchase || {};
    form.paymentAccountId = assetPurchaseDefaults.value.cash || '';
    form.purchasePayableAccountId = assetPurchaseDefaults.value.payable || '';
  }
  if (view.value === 'asset-categories') {
    const settings = await api.get('/account-settings/defaults');
    const saved = settings.defaults.assets || {};
    for (const key of ['assetAccountId', 'accumulatedDepAccountId', 'depreciationExpenseAccountId']) if (saved[key]) form[key] = saved[key];
  }
  createOpen.value = true;
}
function removeLine(list: any[], line: any) {
  list.splice(list.indexOf(line), 1);
}
async function refresh() {
  await qc.invalidateQueries({ queryKey: ["accountant-v2"] });
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    let url = `/accountant-management/${endpoint.value.split("?")[0]}`,
      body: any = { ...form };
    if (view.value === 'fixed-assets' && !assetAction.value && !body.vendorId) body.vendorId = null;
    if (view.value === "budgets")
      body = {
        ...body,
        allocations: body.allocations.map((x: any) => ({
          accountId: x.accountId,
          periods: Array(form.periodType === 'MONTHLY' ? 12 : form.periodType === 'QUARTERLY' ? 4 : 1).fill(Number(x.amount)),
        })),
      };
    if (view.value === "bulk-updates") {
      url = "/accountant-management/bulk-update/accounts";
      body = {
        accountIds: form.accountIds,
        ...(form.statusChoice !== "UNCHANGED"
          ? { isActive: form.statusChoice === "ACTIVE" }
          : {}),
        ...(form.dashboardChoice !== "UNCHANGED"
          ? { showOnDashboard: form.dashboardChoice === "SHOW" }
          : {}),
      };
    }
    if (assetAction.value)
      url = `/accountant-management/fixed-assets/${selectedAsset.value.id}/${assetAction.value}`;
    await api.post(url, body);
    createOpen.value = false;
    toast.add({ title: "Saved", color: "green" });
    await refresh();
  } catch (e) {
    toast.add({
      title: "Could not save",
      description: (e as Error).message,
      color: "red",
    });
  } finally {
    saving.value = false;
  }
}
async function generate(r: any) {
  await api.post(
    `/accountant-management/recurring-journals/${r.id}/generate`,
    {},
  );
  await refresh();
}
async function publishAdjustment(row: any) {
  await api.post(`/accountant-management/currency-adjustments/${row.id}/publish`);
  await refresh();
}
async function toggleRecurring(r: any) {
  await api.post(
    `/accountant-management/recurring-journals/${r.id}/toggle`,
    {},
  );
  await refresh();
}
async function unlock(r: any) {
  const reason = window.prompt("Reason for unlocking");
  if (reason) {
    await api.post(`/accountant-management/transaction-locks/${r.id}/unlock`, {
      reason,
    });
    await refresh();
  }
}
async function reverse(r: any) {
  await api.post(`/manual-journals/${r.id}/reverse`, {
    journalDate: today(),
    notes: `Reversal of ${r.entryNumber}`,
  });
  await refresh();
}
async function startAssetAction(r: any, a: string) {
  selectedAsset.value = r;
  reset();
  assetAction.value = a;
  Object.assign(
    form,
    a === "depreciate"
      ? { date: today() }
      : {
          disposalDate: today(),
          disposalMethod: "SALE",
          proceeds: 0,
          proceedsAccountId: null,
          gainLossAccountId: null,
        },
  );
  if (a === 'dispose') {
    const settings = await api.get('/account-settings/defaults');
    const saved = settings.defaults.assets || {};
    form.proceedsAccountId = saved.proceedsAccountId || null;
    form.gainLossAccountId = saved.gainLossAccountId || null;
  }
  createOpen.value = true;
}
async function savePreferences() {
  saving.value = true;
  try {
    await api.put("/accountant-management/preferences", {
      ...preference,
      journalCustomFields: preference.journalCustomFields || [],
    });
    toast.add({ title: "Preferences saved", color: "green" });
  } finally {
    saving.value = false;
  }
}
watch(
  () => preferenceQ.data.value,
  (v) => {
    if (v) Object.assign(preference, v);
  },
  { immediate: true },
);
watch(view, () => {
  createOpen.value = false;
  accountFilter.value = "";
});
</script>
