<script setup lang="ts">
import { ref, computed, watch } from 'vue';
const emit = defineEmits(['product-selected','clicked','total-amount', 'product-deleted']);
const props = defineProps<{
  settledMap: Map<string, boolean>;
  productIds?: string[];
  poId?: string;
  pendingProducts?: any[];
  products?: any[];   // single source of truth, fetched by the parent (raw-SQL)
  loading?: boolean;  // parent's fetch loading state
}>();
const route = useRoute();
const isEdit = computed(() => String(route.query.isEdit || ''));
const isSettled = (productId: string) => props.settledMap.get(productId) ?? true;
const totalAmount = ref(0);
const toast = useToast();

// Ids hidden from the visible table while their DELETE is in flight (optimistic
// remove). On error we drop the id from this set and the row reappears; on
// success the watcher below prunes it once the parent's refetched data drops it.
const deletingIds = ref<Set<string>>(new Set());

const productIds = computed(() => props.productIds || []);
const isDraftMode = computed(() => props.productIds !== undefined);

// The parent owns data fetching now (no internal query) — so there is no
// separate-timing flicker between the pending placeholder and the real row.
const showTableLoading = computed(() => !!props.loading && !(props.products?.length))

const sourceProducts = computed(() => {
  const persistedProducts = props.products || [];

  const applyDeletingFilter = (list: any[]) =>
    deletingIds.value.size ? list.filter((p: any) => !deletingIds.value.has(p.id)) : list;

  if (!isDraftMode.value) return applyDeletingFilter(persistedProducts);

  const pendingProducts = props.pendingProducts || [];
  if (!pendingProducts.length) return applyDeletingFilter(persistedProducts);

  // Merge by id with stable ordering — the same row updates in place from
  // pending snapshot → persisted DB data, no swap/reset:
  //   • Keep pending order first (so a freshly added row stays where it was placed).
  //   • Append persisted products that don't have a pending entry.
  //   • When both exist for the same id, prefer the persisted version so the
  //     row's data refreshes without changing its position in the list.
  const persistedById = new Map(persistedProducts.map((product: any) => [product.id, product]))
  const pendingById = new Map(pendingProducts.map((product: any) => [product.id, product]))
  const orderedIds: string[] = []
  for (const p of pendingProducts) orderedIds.push(p.id)
  for (const p of persistedProducts) {
    if (!pendingById.has(p.id)) orderedIds.push(p.id)
  }
  return applyDeletingFilter(orderedIds.map(id => persistedById.get(id) ?? pendingById.get(id)))
});


watch(
  sourceProducts, 
  (val) => {
    if (!val) return
    const variants = val.flatMap((product) => product.variants)
    totalAmount.value = variants.reduce((sum, variant) => {
      if (!variant.items || !Array.isArray(variant.items)) return sum

      const variantTotal = variant.items.reduce((itemSum, item) => {
        const qty = isEdit.value ? (item.initialQty || 0) : (item.qty || 0)
        const pprice = variant.pprice || 0
        return itemSum + qty * pprice
      }, 0)

      return sum + variantTotal
    }, 0)
      emit('total-amount', totalAmount.value);
  },
  { immediate: true, deep: true }
)



// Compute table data
const products = computed(() => {
  return sourceProducts.value?.map(product => ({
    id: product.id,
    name: product.name,
    quantity: 1, 
    variants: product.variants,
    isPending: product.isPending,
    raw: product,
  })) || [];
});

// Table columns
const columns = [
  { label: 'Name', key: 'name' },
  { label: 'QTY', key: 'qty' },
  { label: 'Action', key: 'action' }
];

const variantColumns = [
  { label: 'Variant Name', key: 'name' },
  { label: 'Price', key: 'sprice' },
  { label: 'Quantity', key: 'qty' },
];

// Expand state
const expand = ref({ openedRows: [], row: null });

// 🟢 Remove product function — optimistic:
//   1. Hide the row immediately by adding its id to `deletingIds`.
//   2. Fire the DELETE mutation in the background.
//   3. On success → tell parent (so it can drop the id from `draft.productIds`,
//      which triggers a refetch); the watcher below prunes `deletingIds` once
//      the refreshed data no longer contains the id.
//   4. On error → restore the row by removing the id from `deletingIds`,
//      and surface the error via a toast.
const removeProduct = (id: string) => {
  if (!isSettled(id)) return;
  if (deletingIds.value.has(id)) return;
  deletingIds.value = new Set([...deletingIds.value, id]);
  $fetch('/api/products/delete', { method: 'POST', body: { id } })
    .then(() => {
      emit('product-deleted', id);
    })
    .catch((err: any) => {
      const next = new Set(deletingIds.value);
      next.delete(id);
      deletingIds.value = next;
      toast.add({
        title: 'Failed to delete product',
        description: err?.data?.statusMessage ?? err?.message,
        color: 'red',
      });
    });
};

// Prune deletingIds only after the id is truly gone everywhere:
//   • not in `productIds` (parent has emitted product-deleted on success)
//   • AND not in `draftProducts`/PO (post-refetch confirms it's gone)
//
// Pruning earlier (e.g. as soon as ZenStack's optimisticUpdate scrubs the
// row from cache) causes a flicker on fast clicks: the parent still has the
// id while the mutation is in flight, and any momentary cache state that
// reflects the id back (e.g. placeholderData during the new query key's
// fetch) would briefly re-show the row before it disappears again.
watch([() => props.products, () => productIds.value], () => {
  if (!deletingIds.value.size) return;
  const persistedList = props.products || [];
  const dataIds = new Set(persistedList.map((p: any) => p.id));
  const propIds = new Set(productIds.value);
  const cleaned = new Set(
    [...deletingIds.value].filter(id => dataIds.has(id) || propIds.has(id))
  );
  if (cleaned.size !== deletingIds.value.size) {
    deletingIds.value = cleaned;
  }
});

const normalizeProductForEdit = (product: any) => {
  if (!isEdit.value) return product;

  return {
    ...product,
    variants: product.variants?.map((variant: any) => ({
      ...variant,
      items: variant.items?.map((item: any) => ({
        ...item,
        qty: item.initialQty ?? item.qty ?? 0
      }))
    }))
  };
};

const editProduct = (id: string) => {
  if (!isSettled(id)) return;
  const selected = sourceProducts.value?.find(p => p.id === id);

  if (selected) {
    const normalizedProduct = normalizeProductForEdit(selected);

    emit('product-selected', normalizedProduct);
    console.log('Selected product (edit mode):', normalizedProduct);
  }
};

const editProductsm = (id: string) => {
  if (!isSettled(id)) return;
  const selected = sourceProducts.value?.find(p => p.id === id);

  if (selected) {
    const normalizedProduct = normalizeProductForEdit(selected);

    emit('clicked', true);
    emit('product-selected', normalizedProduct);
  }
};


</script>


<template>
  <div>
    <UTable class="w-full table-auto" :loading="showTableLoading" v-model:expand="expand" :rows="products" :columns="columns">
       <template #qty-data="{ row }">
  {{
    row.variants?.reduce((variantTotal, variant) => {
      const itemTotal =
        variant.items?.reduce((sum, item) => {
          const qty = isEdit
            ? (item.initialQty || 0)
            : (item.qty || 0)

          return sum + qty
        }, 0) || 0

      return variantTotal + itemTotal
    }, 0)
  }}
</template>

      <template #action-data="{ row }">
        <div class="hidden md:block">
          <UButton :loading="!isSettled(row.id)" v-if="!isSettled(row.id)"
            size="sm"
            color="gray"
            variant="ghost"
        />
        <UButton
          v-if="isSettled(row.id)"
          icon="i-heroicons-trash"
          size="sm"
          color="red"
          square
          variant="solid"
          @click="removeProduct(row.id)" 
          class="me-2"
        />
        <UButton
         v-if="isSettled(row.id)"
          icon="i-heroicons-pencil"
          size="sm"
          color="blue"
          square
          variant="solid"
          @click="editProduct(row.id)" 
        />
        </div>

        <div class="md:hidden">
        <UButton :loading="!isSettled(row.id)" v-if="!isSettled(row.id)"
          size="sm"
          color="gray"
          variant="ghost"
        />
        <UButton
         v-if="isSettled(row.id)"
          icon="i-heroicons-trash"
          size="sm"
          color="red"
          square
          variant="solid"
          @click="removeProduct(row.id)" 
          class="me-2"
        />
        <UButton
         v-if="isSettled(row.id)"
          icon="i-heroicons-pencil"
          size="sm"
          color="blue"
          square
          variant="solid"
          @click="editProductsm(row.id)" 
        />
      </div>
      </template>

      <template #expand="{ row }">
        <div class="p-4 border-t">
          <UTable 
            :rows="row.variants" 
            :columns="variantColumns"
          >
          <template #qty-data="{ row }">
            {{
              row.items?.reduce((variantTotal, item) => {
                const qty = isEdit
                  ? (item.initialQty || 0)
                  : (item.qty || 0)

                return variantTotal + qty
              }, 0)
            }}
          </template>

          </UTable>
        </div>
      </template>
    </UTable>
  </div>


</template>
