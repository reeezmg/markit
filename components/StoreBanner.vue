<script setup lang="ts">
const banners = [
  {
    id: 1,
    title: "Summer Collection",
    subtitle: "Up to 50% Off",
    image: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1600&q=80",
    link: "/collection/summer"
  },
  {
    id: 2,
    title: "New Arrivals",
    subtitle: "Discover the latest trends",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1600&q=80",
    link: "/collection/new"
  }
];

const currentBanner = ref(0);

// Auto-rotate banners
onMounted(() => {
  setInterval(() => {
    currentBanner.value = (currentBanner.value + 1) % banners.length;
  }, 5000);
});
</script>

<template>
  <div class="relative h-64 md:h-96 w-full mb-6 rounded-lg overflow-hidden">
    <Transition name="fade" mode="out-in">
      <div :key="banners[currentBanner].id" class="relative w-full h-full">
        <img 
          :src="banners[currentBanner].image" 
          :alt="banners[currentBanner].title"
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center flex-col">
          <h1 class="text-3xl md:text-5xl font-bold text-white mb-2">{{ banners[currentBanner].title }}</h1>
          <p class="text-xl md:text-2xl text-white mb-4">{{ banners[currentBanner].subtitle }}</p>
          <UButton 
            :to="banners[currentBanner].link"
            color="white"
            variant="solid"
            label="Shop Now"
          />
        </div>
      </div>
    </Transition>
    
    <!-- Banner Indicators -->
    <div class="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
      <button 
        v-for="(banner, index) in banners"
        :key="banner.id"
        @click="currentBanner = index"
        class="w-3 h-3 rounded-full transition-all"
        :class="currentBanner === index ? 'bg-white w-6' : 'bg-white bg-opacity-50'"
      />
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>