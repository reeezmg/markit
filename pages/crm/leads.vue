<script setup lang="ts">
import { crmClientLocation } from '../../utils/crm'
definePageMeta({ redirect: to => crmClientLocation(to.query) })
</script>
<template><span /></template>
