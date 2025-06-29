<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { useFindUniquePurchaseOrder, useDeleteProduct, useUpdateProduct } from '~/lib/hooks';

const emit = defineEmits(['product-selected','clicked']);
const DeleteProduct = useDeleteProduct({ // ✅ Your mutation callbacks (optional)
  onSuccess: (data) => console.log('Created:', data),
  onError: (err) => console.error('Error:', err),

  // ✅ These control automatic behavior
  invalidate: true,
  optimisticUpdate: true});
const route = useRoute();
const poId = String(route.query.poId || '');

const {
  data: PO,
  isLoading,
  error,
  refetch,
} = useFindUniquePurchaseOrder({
  where: { id: poId },
  include: {
    products: { include: { variants: { include: { items: true } } } },
  },
});


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
const removeProduct = async(id:string) => {
  try {
    await DeleteProduct.mutateAsync({ where: { id } });
  } catch (err) {
    console.log(err);
  }
};

// 🟢 Edit product function
const editProduct = (id: string) => {
  const selected = PO.value?.products?.find(p => p.id === id);
  if (selected) {
    emit('product-selected', selected);
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
        <UButton
          icon="i-heroicons-trash"
          size="sm"
          color="red"
          square
          variant="solid"
          @click="removeProduct(row.id)" 
          class="me-2"
        />
        <UButton
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
          icon="i-heroicons-trash"
          size="sm"
          color="red"
          square
          variant="solid"
          @click="removeProduct(row.id)" 
          class="me-2"
        />
        <UButton
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
