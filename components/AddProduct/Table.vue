<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { useFindUniquePurchaseOrder, useDeleteProduct, useUpdateProduct, useFindUniqueProduct } from '~/lib/hooks';

const emit = defineEmits(['product-selected','clicked']);
const DeleteProduct = useDeleteProduct();
const UpdateProduct = useUpdateProduct();
const route = useRoute();
const poId = String(route.query.poId || '');
const product = ref(null);
const selectedProductId = ref<string | null>(null); // Store the selected product ID

const {
  data: PO,
  isLoading,
  error,
  refetch,
} = useFindUniquePurchaseOrder({
  where: { id: poId },
  include: {
    products: { include: { variants: true } },
  },
});


const queryArgs = computed(() => ({
  where: { id: selectedProductId.value || '' }, // Provide a default empty string
  include: {
    category: true ,
    subcategory:true,
    variants: true,
  },
}));

// Use the computed query arguments
const { data: productData, refetch: fetchProduct } = useFindUniqueProduct(queryArgs);


// Watch for changes and update product ref
watch(() => productData.value, (newValue) => {
  if (newValue) {
    emit('product-selected', newValue);
    console.log(newValue);
  }
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
  { label: 'Price', key: 'price' },
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
const editProduct = async(id:string) => {
  selectedProductId.value = id; // Set the product ID
  await fetchProduct(); // Fetch the product details
};

const editProductsm = async(id:string) => {
  selectedProductId.value = id; // Set the product ID
  await fetchProduct(); // Fetch the product details
  emit('clicked', true);
};
</script>


<template>
  <div>
    <UTable class="w-full table-auto"  v-model:expand="expand" :rows="products" :columns="columns">
      <template #qty-data="{ row }">
        {{ row.variants?.reduce((sum, v) => sum + (v.qty || 0), 0) }}
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
          />
        </div>
      </template>
    </UTable>
  </div>


</template>
