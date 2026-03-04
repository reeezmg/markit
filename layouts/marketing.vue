<template>
  <div class="min-h-screen flex flex-col bg-[#F8FDF3]">
    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-gray-200 px-4 py-5">
      <p class="text-center text-xs sm:text-sm text-gray-600">
        © 2026 Flobit Technologies Private Limited. All rights reserved.
      </p>
    </footer>
  </div>
</template>
