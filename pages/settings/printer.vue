<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BleClient } from '@capacitor-community/bluetooth-le'

const devices = ref<any[]>([])
const connectedDevices = ref<any[]>([])
const scanning = ref(false)

// Initialize BLE on mount
onMounted(async () => {
  await BleClient.initialize()
  connectedDevices.value = await BleClient.getConnectedDevices()
})

// Scan for devices
const startScan = async () => {
  devices.value = []
  scanning.value = true
  await BleClient.requestLEScan({}, (device) => {
    // Avoid duplicates
    if (!devices.value.find(d => d.deviceId === device.deviceId)) {
      devices.value.push(device)
    }
  })
}

// Stop scanning
const stopScan = async () => {
  await BleClient.stopLEScan()
  scanning.value = false
}

// Connect to device
const connectDevice = async (device: Device) => {
  await BleClient.connect(device.deviceId)
  connectedDevices.value.push(device)
}

// Disconnect device
const disconnectDevice = async (device: Device) => {
  await BleClient.disconnect(device.deviceId)
  connectedDevices.value = connectedDevices.value.filter(d => d.deviceId !== device.deviceId)
}
</script>

<template>
  <div class="p-4 space-y-4">
    <div class="flex gap-2">
      <button class="btn" @click="startScan" :disabled="scanning">Scan Devices</button>
      <button class="btn" @click="stopScan" :disabled="!scanning">Stop Scan</button>
    </div>

    <div>
      <h3 class="text-lg font-semibold">Available Devices</h3>
      <ul class="space-y-1">
        <li v-for="device in devices" :key="device.deviceId" class="flex justify-between items-center">
          <span>{{ device.name || 'Unknown' }} ({{ device.deviceId }})</span>
          <button class="btn btn-sm" @click="connectDevice(device)">Connect</button>
        </li>
      </ul>
    </div>

    <div>
      <h3 class="text-lg font-semibold">Connected Devices</h3>
      <ul class="space-y-1">
        <li v-for="device in connectedDevices" :key="device.deviceId" class="flex justify-between items-center">
          <span>{{ device.name || 'Unknown' }} ({{ device.deviceId }})</span>
          <button class="btn btn-sm btn-error" @click="disconnectDevice(device)">Disconnect</button>
        </li>
      </ul>
    </div>
  </div>
</template>
