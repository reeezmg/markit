// composables/usePrinter.ts
import { ref } from 'vue'
import { BleClient } from '@capacitor-community/bluetooth-le'

export function usePrinter() {
  const connectedDevice = ref<any | null>(null)

  // Connect to a device
  const connectPrinter = async (device: any) => {
    await BleClient.connect(device.deviceId)
    connectedDevice.value = device
  }

  // Disconnect
  const disconnectPrinter = async () => {
    if (!connectedDevice.value) return
    await BleClient.disconnect(connectedDevice.value.deviceId)
    connectedDevice.value = null
  }

  // Print simple ESC command: MARKIT centered
  const printMarkit = async () => {
    if (!connectedDevice.value) throw new Error('No printer connected')

    // ESC/POS: center text + print
    const encoder = new TextEncoder()
    const data = encoder.encode(
      '\x1b\x61\x01' + // ESC a 1 -> center
      'MARKIT\n' +
      '\x1b\x61\x00'   // ESC a 0 -> left
    )

    // Send data over BLE (service/characteristic must match your printer)
    const service = '0000ffe0-0000-1000-8000-00805f9b34fb' // example, change if needed
    const characteristic = '0000ffe1-0000-1000-8000-00805f9b34fb'

    await BleClient.write(connectedDevice.value.deviceId, service, characteristic, data)
  }

  return {
    connectedDevice,
    connectPrinter,
    disconnectPrinter,
    printMarkit,
  }
}
