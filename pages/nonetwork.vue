<template>
  <div class="flex flex-col items-center justify-center h-screen text-center p-6">
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
definePageMeta({
    layout: false,
});

const router = useRouter()
let handleOnline

const retry = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  if (navigator.onLine) {
    const prevUrl = localStorage.getItem('prevRoute') || '/'
    localStorage.removeItem('prevRoute')
    router.replace(prevUrl)
  } else {
    alert('Still offline 😕')
  }
}

// ✅ only attach listener after client mount
onMounted(() => {
  handleOnline = () => retry()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && handleOnline) {
    window.removeEventListener('online', handleOnline)
  }
})
</script>
