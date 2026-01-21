<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { useFindUniquePurchaseOrder, useDeleteProduct } from '~/lib/hooks';
const isEdit = computed(() => String(route.query.isEdit || ''));
const emit = defineEmits(['product-selected','clicked','total-amount']);
const props = defineProps<{
  settledMap: Map<string, boolean>;
}>();
const isSettled = (productId: string) => props.settledMap.get(productId) ?? true;
const totalAmount = ref('');

const DeleteProduct = useDeleteProduct({
  optimisticUpdate: true
});

const route = useRoute();
const poId = computed(() => String(route.query.poId || ''));

const queryParams = computed(() => ({
  where: { id: poId.value },
  include: {
    products: { include: { variants: { include: { items: true } } } },
  }
}));

const {
  data: PO,
  isLoading,
  error,
  refetch,
} = useFindUniquePurchaseOrder(queryParams);


watch(
  () => PO.value, 
  (val) => {
    if (!val) return
    const variants = val.products.flatMap((product) => product.variants)
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
  return PO.value?.products?.map(product => ({
    id: product.id,
    name: product.name,
    quantity: 1, 
    variants: product.variants
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

// 🟢 Remove product function
const removeProduct = (id:string) => {
  try {
     DeleteProduct.mutate({ where: { id } });
  } catch (err) {
    console.log(err);
  }
};

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
  const selected = PO.value?.products?.find(p => p.id === id);

  if (selected) {
    const normalizedProduct = normalizeProductForEdit(selected);

    emit('product-selected', normalizedProduct);
    console.log('Selected product (edit mode):', normalizedProduct);
  }
};

const editProductsm = (id: string) => {
  const selected = PO.value?.products?.find(p => p.id === id);

  if (selected) {
    const normalizedProduct = normalizeProductForEdit(selected);

    emit('clicked', true);
    emit('product-selected', normalizedProduct);
  }
};


</script>


<template>
  <div>
    <UTable class="w-full table-auto" :loading="isLoading" v-model:expand="expand" :rows="products" :columns="columns">
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
