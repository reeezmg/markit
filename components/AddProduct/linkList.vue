<script setup lang="ts">
const props = defineProps<{
    linkList: string[];
}>();
</script>

<template>
    <UPageCard class="m-3">
        <div class="text-lg"> Quick Links</div>
        <div v-for="item in linkList" :key="item">
            <hr class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700" />
            <ULink
                :to="`#${item}`"
                active-class="text-primary"
                inactive-class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
                {{ item }}
            </ULink>
        </div>
    </UPageCard>
</template>
