<script setup lang="ts">
import { usePrinter } from '~/composables/usePrinter'
import { ref } from 'vue'

const { connectedDevice, connectPrinter, disconnectPrinter, printMarkit } = usePrinter()
const device = ref<any>(null) // assign from your scanned device
</script>

<template>
  <div class="p-4 space-y-2">
    <button class="btn" @click="connectPrinter(device)">Connect Printer</button>
    <button class="btn" @click="printMarkit" :disabled="!connectedDevice">Print MARKIT</button>
    <button class="btn btn-error" @click="disconnectPrinter" :disabled="!connectedDevice">Disconnect</button>
  </div>
</template>
