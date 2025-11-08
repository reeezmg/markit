<template>
  <div class="flex flex-col w-full items-center justify-center h-screen text-center p-6">
    <h1 class="text-2xl font-semibold mb-2">You’re Offline</h1>
    <p class="text-gray-500 mb-6">
      Please check your internet connection and try again.
    </p>
    <button
      class="bg-primary text-white px-6 py-2 rounded-xl"
      @click="retry"
    >
      Retry
    </button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()

definePageMeta({
    layout: false,
});

const retry = () => {
  if (navigator.onLine) {
    const prevUrl = localStorage.getItem('prevRoute') || '/'
    localStorage.removeItem('prevRoute')
    router.replace(prevUrl)
  } else {
    alert('Still offline 😕')
  }
}

// 👇 automatically go back when network restores
window.addEventListener('online', () => retry())
</script>
