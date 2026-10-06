<script setup lang="ts">
withDefaults(defineProps<{kind?:'accounting'|'source'|'mixed';detail?:string}>(),{kind:'accounting',detail:''});
</script>
<template><p class="text-xs text-gray-500 leading-5"><strong>{{ kind==='source'?'Source records':kind==='mixed'?'Source details + posted accounting':'Posted accounting' }}</strong> &middot; {{ detail || (kind==='accounting'?'Published journals, including reversals. Unposted or unimported activity is excluded.':'Document amounts and operational activity; not an accounting profit or account balance.') }}</p></template>
