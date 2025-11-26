<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

let encoder = new ReceiptPrinterEncoder();

const devices = ref<any[]>([]);
const savedPrinters = ref<any[]>([]);
const selectedDevice = ref<any | null>(null);
const connectionStatus = ref('');
const onlineDeviceIds = ref<string[]>([]);

// Printer service/characteristic UUIDs
const PRINTER_SERVICES = {
  SERVICE: '000018f0-0000-1000-8000-00805f9b34fb',
  CHARACTERISTIC: '00002af1-0000-1000-8000-00805f9b34fb'
};

// LocalStorage helpers
const loadSavedPrinters = () => {
  const saved = localStorage.getItem('savedPrinters');
  const lastSelected = localStorage.getItem('selectedPrinter');
  savedPrinters.value = saved ? JSON.parse(saved) : [];

  if (lastSelected) {
    const parsed = JSON.parse(lastSelected);
    const match = savedPrinters.value.find(d => d.deviceId === parsed.deviceId);
    selectedDevice.value = match || null;
  }
};
const savePrinters = () => {
  localStorage.setItem('savedPrinters', JSON.stringify(savedPrinters.value));
};
const saveSelectedPrinter = (device: any | null) => {
  selectedDevice.value = device;
  if (device) {
    localStorage.setItem('selectedPrinter', JSON.stringify(device));
  } else {
    localStorage.removeItem('selectedPrinter');
  }
};

// Initialize BLE
onMounted(async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await BleClient.initialize();
      loadSavedPrinters();
      await scanDevices();
    } catch (err) {
      console.error('BLE init failed:', err);
    }
  }
});

// Scan for devices
const scanDevices = async () => {
  if (!Capacitor.isNativePlatform()) {
    alert('Bluetooth only works on a real device.');
    return;
  }

  try {
    connectionStatus.value = 'scanning';
    devices.value = [];
    onlineDeviceIds.value = [];

    await BleClient.requestLEScan(
      {
        services: [PRINTER_SERVICES.SERVICE],
        allowDuplicates: false,
      },
      (device: any) => {
        const printer = {
          deviceId: device.device.deviceId,
          name: device.device.name || device.localName || 'Unnamed',
          rssi: device.rssi,
        };

        if (savedPrinters.value.find(d => d.deviceId === printer.deviceId)) {
          if (!onlineDeviceIds.value.includes(printer.deviceId)) {
            onlineDeviceIds.value.push(printer.deviceId);
          }
        } else {
          if (!devices.value.find(d => d.deviceId === printer.deviceId)) {
            devices.value.push(printer);
          }
        }
      }
    );

    setTimeout(async () => {
      await BleClient.stopLEScan();
      connectionStatus.value = '';
    }, 5000);

  } catch (err: any) {
    console.error('Error scanning:', err.message);
    connectionStatus.value = 'error';
  }
};

// Add printer
const addPrinter = (device: any) => {
  if (!savedPrinters.value.find(d => d.deviceId === device.deviceId)) {
    savedPrinters.value.push(device);
    savePrinters();
  }
  saveSelectedPrinter(device);
};

// Remove printer
const removePrinter = (deviceId: string) => {
  if (selectedDevice.value?.deviceId === deviceId) {
    saveSelectedPrinter(null);
  }
  savedPrinters.value = savedPrinters.value.filter(d => d.deviceId !== deviceId);
  savePrinters();
  onlineDeviceIds.value = onlineDeviceIds.value.filter(id => id !== deviceId);
};

// Toggle Select printer
const toggleSelectPrinter = (device: any) => {
  if (selectedDevice.value?.deviceId === device.deviceId) {
    // already selected → deselect
    saveSelectedPrinter(null);
  } else {
    // select new one
    saveSelectedPrinter(device);
  }
};

// Send test print
const sendTestPrint = async () => {
  const device = selectedDevice.value;
  if (!device) return;

  connectionStatus.value = 'printing';

  try {
    await BleClient.connect(device.deviceId);

    const data = encoder
      .initialize()
      .bold(true)
      .align('center')
      .text('Shopname')
      .newline()
      .text('MRP Rs. 1440.00')
      .newline()
      .barcode('313063057461', 'code128', { height: 60, text: true })
      .encode();

    await BleClient.write(
      device.deviceId,
      PRINTER_SERVICES.SERVICE,
      PRINTER_SERVICES.CHARACTERISTIC,
      data
    );

    await BleClient.disconnect(device.deviceId);
    connectionStatus.value = 'success';
  } catch (err: any) {
    console.error('Print failed:', err.message);
    connectionStatus.value = 'error';
  }
};
</script>

<template>
  <div class="p-4 space-y-4">
    <!-- Action Buttons -->
    <div class="flex gap-4">
      <UButton 
        @click="scanDevices" 
        :loading="connectionStatus === 'scanning'"
        :disabled="connectionStatus === 'printing'"
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
        <div
          v-for="device in savedPrinters"
          :key="device.deviceId"
          class="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
        >
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ device.name || device.deviceId }}</span>
            <span 
              v-if="onlineDeviceIds.includes(device.deviceId)"
              class="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800"
            >
              Online
            </span>
          </div>
          <div class="flex gap-2">
            <UButton
              variant="soft"
              color="blue"
              size="sm"
              @click.stop="toggleSelectPrinter(device)"
            >
              {{ selectedDevice?.deviceId === device.deviceId ? 'Selected' : 'Select' }}
            </UButton>
            <UButton 
              variant="soft" 
              color="red" 
              size="sm" 
              @click.stop="removePrinter(device.deviceId)"
            >
              Remove
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
            @click="addPrinter(device)"
            color="primary"
            variant="soft"
            block
          >
            Add {{ device.name || device.deviceId }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
