<script setup lang="ts">
const { $client } = useNuxtApp()

const currentMessage = ref('')

$client.onMessage.subscribe(undefined, {
  onData(message) {
    currentMessage.value = message
  },
})

const search = ref("")

watch(search, () => {
    console.log(search)
});


function sendMessage() {
  $client.sendMessage.query({ text: search.value })
}

</script>

<template>
  <div>
    <UInput
      v-model="search"
      icon="i-heroicons-magnifying-glass-20-solid"
      placeholder="Search..."
  />
    <p>Message: {{ currentMessage }}</p>
    <button @click="sendMessage">Send message</button>
  </div>
</template>