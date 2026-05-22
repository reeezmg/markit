<script setup lang="ts">
const router = useRouter()

const goBack = () => {
    router.push('/projects')
}
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <ProjectsNewProjectModal mode="page" @saved="goBack" @cancel="goBack" />
    </UDashboardPanelContent>
</template>
