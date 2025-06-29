<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid';
const { $db } = useNuxtApp()

async function createProduct() {
  const id = uuidv4()
  const createdAt = new Date().toISOString()
  const updatedAt = new Date().toISOString()

  const result = await $db.sql`
    INSERT INTO products (
      id, name, brand, status, rating, description, company_id, category_id,
    purchaseorder_id, created_at, updated_at
    ) VALUES (
      ${id}, 'New Product', 'MyBrand', true, 4.5, 'Example description',
      '82dbfd2f-bdcb-435a-b644-0136991a8f2c', '582151b3-7009-4a60-90bb-476dc1e1ee08',
      'ff804355-9506-4409-bf2a-55ca571415d9', ${createdAt}, ${updatedAt}
    )
  `

  console.log('Inserted product:', result)
}
</script>

<template>
  <div class="p-4">
    <button @click="createProduct" class="bg-blue-500 text-white px-4 py-2 rounded">
      Create Product
    </button>
  </div>
</template>
