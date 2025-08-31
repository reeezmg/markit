<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

let encoder = new ReceiptPrinterEncoder();

const devices = ref<any[]>([]);
const selectedDevice = ref<any | null>(null);
const savedPrinters = ref<any[]>([]);
const connectionStatus = ref('');
const debugLog = ref<string[]>([]);
const loadingDeviceId = ref<string | null>(null); // Track which device is loading


// Printer service/characteristic UUIDs
const PRINTER_SERVICES = {
  SERVICE: '000018f0-0000-1000-8000-00805f9b34fb',
  CHARACTERISTIC: '00002af1-0000-1000-8000-00805f9b34fb'
};

// Debug logger
const log = (message: string) => {
  debugLog.value.push(`${new Date().toLocaleTimeString()}: ${message}`);
};

// LocalStorage helpers
const loadSavedPrinters = () => {
  const saved = localStorage.getItem('savedPrinters');
  const lastSelected = localStorage.getItem('selectedPrinter');
  savedPrinters.value = saved ? JSON.parse(saved) : [];
  
  if (savedPrinters.value.length) {
    if (lastSelected) {
      // Try to find the last selected printer
      const lastDevice = savedPrinters.value.find(d => d.deviceId === JSON.parse(lastSelected).deviceId);
      selectedDevice.value = lastDevice || savedPrinters.value[0];
    } else {
      selectedDevice.value = savedPrinters.value[0];
    }
    log(`📦 Loaded ${savedPrinters.value.length} saved printer(s)`);
  }
};
const savePrinters = () => {
  localStorage.setItem('savedPrinters', JSON.stringify(savedPrinters.value));
  if (selectedDevice.value) {
    localStorage.setItem('selectedPrinter', JSON.stringify(selectedDevice.value));
  }
};

// Initialize BLE and scan for devices
onMounted(async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await BleClient.initialize();
      log('BLE initialized ✅');
      loadSavedPrinters();
      // Start scanning for devices immediately
      await scanDevices();
    } catch (err) {
      log(`BLE init failed: ${err}`);
    }
  } else {
    log('BLE not supported in browser ❌');
  }
});

const scanDevices = async () => {
  if (!Capacitor.isNativePlatform()) {
    alert('Bluetooth only works on a real device.');
    return;
  }

  try {
    log('Starting device scan...');
    connectionStatus.value = 'scanning';
    devices.value = [];

    // Start scanning and provide a callback for each discovered device
    await BleClient.requestLEScan(
      {
        services: [PRINTER_SERVICES.SERVICE],
        allowDuplicates: false,
      },
      (device: any) => {
        // This callback is called for each discovered device
       if (!devices.value.find(d => d.deviceId === device.device.deviceId)) {
        const printer = {
          deviceId: device.device.deviceId,
          name: device.device.name || device.localName || 'Unnamed',
          rssi: device.rssi,
        };
        devices.value.push(printer);
        log(`🔍 Found device: ${printer.name} (${printer.deviceId}), RSSI: ${printer.rssi}`);
      }

      }
    );

    // Stop scan after 5 seconds
    setTimeout(async () => {
      await BleClient.stopLEScan();
      await updateDeviceStatuses();
      log('Scan stopped.');
      connectionStatus.value = '';
    }, 5000);

  } catch (err: any) {
    log(`Error scanning: ${err.message}`);
    connectionStatus.value = 'error';
  }
};


// Select & connect printer
const selectPrinter = async (device: any) => {
  selectedDevice.value = device;
  localStorage.setItem('selectedPrinter', JSON.stringify(device));

  if (!savedPrinters.value.find(d => d.deviceId === device.deviceId)) {
    savedPrinters.value.push(device);
    savePrinters();
  }
  log(`💾 Saved printer: ${device.name || device.deviceId}`);

  try {
    connectionStatus.value = 'connecting';
    loadingDeviceId.value = device.deviceId; // Set loading device ID
    await BleClient.connect(device.deviceId);
    log(`✅ Connected to ${device.name || device.deviceId}`);
    connectionStatus.value = 'connected';
  } catch (err: any) {
    log(`❌ Error connecting: ${err.message}`);
    connectionStatus.value = 'error';
  } finally {
    loadingDeviceId.value = null; // Reset loading device ID
  }
};

// Remove printer
const removePrinter = async (deviceId: string) => {
  loadingDeviceId.value = deviceId;
  try { 
    await BleClient.disconnect(deviceId);
    if (selectedDevice.value?.deviceId === deviceId) {
      selectedDevice.value = null;
      localStorage.removeItem('selectedPrinter');
    }
    savedPrinters.value = savedPrinters.value.filter(d => d.deviceId !== deviceId);
    savePrinters();
  } catch (e) {
    log(`❌ Error disconnecting: ${e}`);
  } finally {
    loadingDeviceId.value = null;
  }
};

// Send test print
const sendTestPrint = async () => {
  if (!selectedDevice.value) return;

  const device = selectedDevice.value;
  connectionStatus.value = 'printing';

  try {
   
const data = encoder
  .initialize()

   .invert()
   .bold(true)
  .size(2,1)
  .align('center')
  .text('Shopname')
   .invert()
  .bold(false)
  .newline()
  // --- Variant - Size ---
  .size(1, 1)
  .align('left')
  .text('Variant - Size')
  .newline()
  // --- MRP ---
  .text('MRP Rs. 1440.00')
  .newline()
  .text('MRP Rs. 1440.00')
  .newline()
  // --- Barcode with label above & below ---
  .raw([0x1D, 0x21, 0x08])
  .text('code-brand') // text above barcode
  .size(1, 1)
  .newline()
  .barcode('313063057461', 'code128', {
        height: 60,
        text: true
    })
.raw([0x1B, 0x64, 0x02])
  .encode() 

    await BleClient.write(device.deviceId, PRINTER_SERVICES.SERVICE, PRINTER_SERVICES.CHARACTERISTIC, data);

    connectionStatus.value = 'success';
    log('🖨️ Test print sent!');
  } catch (err: any) {
    connectionStatus.value = 'error';
    log(`❌ Print failed: ${err.message}`);
  }
};

const deviceStatuses = ref(new Map());

const updateDeviceStatuses = async () => {
  if (!Capacitor.isNativePlatform()) {
    savedPrinters.value.forEach(device => deviceStatuses.value.set(device.deviceId, 'offline'));
    return;
  }

  try {
    const connectedDevices = await BleClient.getConnectedDevices([PRINTER_SERVICES.SERVICE]);
    
    savedPrinters.value.forEach(device => {
      if (selectedDevice?.value?.deviceId === device.deviceId &&
          connectedDevices.find((d: any) => d.deviceId === device.deviceId)) {
        deviceStatuses.value.set(device.deviceId, 'connected');
      } else if (devices.value.find(d => d.deviceId === device.deviceId)) {
        deviceStatuses.value.set(device.deviceId, 'online');
      } else {
        deviceStatuses.value.set(device.deviceId, 'offline');
      }
    });
  } catch {
    savedPrinters.value.forEach(device => deviceStatuses.value.set(device.deviceId, 'offline'));
  }
};

// Update statuses periodically
onMounted(() => {
  updateDeviceStatuses();
  const interval = setInterval(updateDeviceStatuses, 5000);
  onUnmounted(() => clearInterval(interval));
});

</script>


<template>
  <div class="p-4 space-y-4">
    <!-- Action Buttons -->
    <div class="flex gap-4">
      <UButton 
        @click="scanDevices" 
        :loading="connectionStatus === 'scanning'"
        :disabled="connectionStatus === 'connecting' || connectionStatus === 'printing'"
        color="primary"
      >
        {{ connectionStatus === 'scanning' ? 'Scanning...' : 'Scan Printers' }}
      </UButton>

      <UButton 
        @click="sendTestPrint"
        :loading="connectionStatus === 'printing'"
        :disabled="!selectedDevice"
        color="green"
      >
        {{ connectionStatus === 'printing' ? 'Printing...' : 'Send Test Print' }}
      </UButton>
    </div>

    <!-- Saved Printers -->
<div v-if="savedPrinters.length" class="border rounded-lg p-4">
  <h3 class="font-medium mb-2">My Printers:</h3>
  <div class="space-y-2">
    <div v-for="device in savedPrinters" :key="device.deviceId" class="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div class="flex-1 flex items-center justify-between cursor-pointer">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ device.name || device.deviceId }}</span>
          <!-- Status Tag next to name -->
          <span
            :class="[
              'text-xs px-2 py-0.5 rounded-full font-medium',
              deviceStatuses.get(device.deviceId) === 'connected' ? 'bg-green-100 text-green-800' :
              deviceStatuses.get(device.deviceId) === 'online' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-200 text-gray-700'
            ]"
          >
            {{ deviceStatuses.get(device.deviceId) || 'offline' }}
          </span>
        </div>

        <UButton 
          variant="soft" 
          :color="deviceStatuses.get(device.deviceId) === 'connected' ? 'red' : 'primary'" 
          size="sm" 
          class="ml-2"
          :loading="loadingDeviceId === device.deviceId"
          @click.stop="deviceStatuses.get(device.deviceId) === 'connected' ? removePrinter(device.deviceId) : selectPrinter(device)"
        >
          {{ deviceStatuses.get(device.deviceId) === 'connected' ? 'Disconnect' : 'Connect' }}
        </UButton>
      </div>
    </div>
  </div>
</div>


    <!-- Available Printers -->
    <div v-if="devices.length" class="border rounded-lg p-4">
      <h3 class="font-medium mb-2">Available Printers:</h3>
      <div class="space-y-2">
        <div v-for="device in devices" :key="device.deviceId" class="flex items-center gap-2">
          <UButton
            @click="selectPrinter(device)"
            :color="selectedDevice?.deviceId === device.deviceId ? 'primary' : 'gray'"
            variant="soft"
            block
          >
            {{ device.name || device.deviceId }}
          </UButton>
        </div>
      </div>
    </div>

    <!-- Debug Log -->
    <!-- <div v-if="debugLog.length" class="border rounded-lg p-4 mt-4">
      <h3 class="font-medium mb-2">📝 Debug Log:</h3>
      <div class="bg-gray-100 dark:bg-gray-800 p-2 rounded max-h-60 overflow-y-auto">
        <div v-for="(log, index) in debugLog" :key="index" class="text-sm font-mono">
          {{ log }}
        </div>
      </div>
    </div> -->
  </div>
</template>
