<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { useFindUniquePurchaseOrder, useDeleteProduct } from '~/lib/hooks';

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
        const qty = item.qty || 0
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

// 🟢 Edit product function
const editProduct = (id: string) => {
  const selected = PO.value?.products?.find(p => p.id === id);
  if (selected) {
    emit('product-selected', selected);
    console.log('Selected product:', selected);
  }
};

const editProductsm = (id: string) => {
  const selected = PO.value?.products?.find(p => p.id === id);
  if (selected) {
    emit('clicked', true);
    emit('product-selected', selected);
  }
};

</script>


<template>
  <div>
    <UTable class="w-full table-auto" :loading="isLoading" v-model:expand="expand" :rows="products" :columns="columns">
       <template #qty-data="{ row }">
        {{
          row.variants?.reduce((variantTotal, variant) => {
            const itemTotal = variant.items?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0;
            return variantTotal + itemTotal;
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
                return variantTotal + (item.qty || 0);
              }, 0)
            }}
        </template>
          </UTable>
        </div>
      </template>
    </UTable>
  </div>


</template>
