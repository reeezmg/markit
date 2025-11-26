<script setup>
const router = useRouter()
definePageMeta({
  layout: false,
})
</script>
<template>
    <UHeader
          title="Markit"
          class="mb-10 text-[#097D4C]"
          :ui = "{
            title: 'text-[#097D4C]',
          }"
        >
          <template #logo>
            <img
              src="/icons/logo.png"
              class="w-auto h-10"
              @click = " router.push('/')"
            />  
          </template>
          <template #right>
           <div class="hidden lg:flex">
            <UButton
              to="/storelanding"
              class="bg-[#097D4C] text-white hover:bg-[#08643d] me-1"
            >
              List Your store
            </UButton>
            <UButton
              to="/launching"
              class="bg-[#097D4C] text-white hover:bg-[#08643d] me-1"
            >
              Login
            </UButton>
            <UButton
              to="/launching"
              class="bg-[#097D4C] text-white hover:bg-[#08643d]"
            >
              Register
            </UButton>
          </div>
    
          </template>
    
          <template #panel>
          <UNavigationTree :links="navLinks" />
        </template>
    
        </UHeader>
          <NuxtPage />
</template>

