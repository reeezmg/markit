<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import { useUpdateCompany } from '~/lib/hooks';
import { useWebUsbPrinter } from '~/composables/useWebUsbPrinter';

const UpdateCompany = useUpdateCompany({ optimisticUpdate: true });
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();

const printerLabelSizes = ['50x25mm', '50x38 mm'];
const selectedPrinterLabelSize = ref(useAuth().session.value?.printerLabelSize);
const isPrinterLabelSizeChanged = ref(false);
const isUpdatingPrinterLabelSize = ref(false);

watch(
  () => selectedPrinterLabelSize.value,
  (newSize) => {
    isPrinterLabelSizeChanged.value = newSize !== useAuth().session.value?.printerLabelSize;
  },
  { immediate: true },
);

const onPrinterLabelSizeChange = () => {
  isUpdatingPrinterLabelSize.value = true;
  try {
    if (!navigator.onLine) {
      throw createError({ statusCode: 0, statusMessage: 'No internet connection' });
    }
    UpdateCompany.mutate({
      where: { id: useAuth().session.value?.companyId },
      data: { printerLabelSize: selectedPrinterLabelSize.value },
    });
    updatePrinterLabelSize(selectedPrinterLabelSize.value || printerLabelSizes[0]);
    toast.add({ title: 'Printer label size updated', icon: 'i-heroicons-check-circle' });
  } catch (error: any) {
    toast.add({
      title: 'Error updating printer label size',
      description: error?.statusMessage || error?.message,
      color: 'red',
      icon: 'i-heroicons-x-circle',
    });
  } finally {
    isUpdatingPrinterLabelSize.value = false;
  }
};

let encoder = new ReceiptPrinterEncoder();

const devices = ref<any[]>([]);
const savedPrinters = ref<any[]>([]);
const selectedDevice = ref<any | null>(null);
const bluetoothStatus = ref('');
const onlineDeviceIds = ref<string[]>([]);

const PRINTER_SERVICES = {
  SERVICE: '000018f0-0000-1000-8000-00805f9b34fb',
  CHARACTERISTIC: '00002af1-0000-1000-8000-00805f9b34fb',
};

const loadSavedPrinters = () => {
  const saved = localStorage.getItem('savedPrinters');
  const lastSelected = localStorage.getItem('selectedPrinter');
  savedPrinters.value = saved ? JSON.parse(saved) : [];

  if (lastSelected) {
    const parsed = JSON.parse(lastSelected);
    const match = savedPrinters.value.find((device) => device.deviceId === parsed.deviceId);
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

const scanDevices = async () => {
  if (!Capacitor.isNativePlatform()) {
    alert('Bluetooth only works on a real device.');
    return;
  }

  try {
    bluetoothStatus.value = 'scanning';
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

        if (savedPrinters.value.find((savedPrinter) => savedPrinter.deviceId === printer.deviceId)) {
          if (!onlineDeviceIds.value.includes(printer.deviceId)) {
            onlineDeviceIds.value.push(printer.deviceId);
          }
        } else if (!devices.value.find((candidate) => candidate.deviceId === printer.deviceId)) {
          devices.value.push(printer);
        }
      },
    );

    setTimeout(async () => {
      await BleClient.stopLEScan();
      bluetoothStatus.value = '';
    }, 5000);
  } catch (err: any) {
    console.error('Error scanning:', err.message);
    bluetoothStatus.value = 'error';
  }
};

const addPrinter = (device: any) => {
  if (!savedPrinters.value.find((savedPrinter) => savedPrinter.deviceId === device.deviceId)) {
    savedPrinters.value.push(device);
    savePrinters();
  }
  saveSelectedPrinter(device);
};

const removePrinter = (deviceId: string) => {
  if (selectedDevice.value?.deviceId === deviceId) {
    saveSelectedPrinter(null);
  }
  savedPrinters.value = savedPrinters.value.filter((device) => device.deviceId !== deviceId);
  savePrinters();
  onlineDeviceIds.value = onlineDeviceIds.value.filter((id) => id !== deviceId);
};

const toggleSelectPrinter = (device: any) => {
  if (selectedDevice.value?.deviceId === device.deviceId) {
    saveSelectedPrinter(null);
  } else {
    saveSelectedPrinter(device);
  }
};

const sendTestPrint = async () => {
  const device = selectedDevice.value;
  if (!device) return;

  bluetoothStatus.value = 'printing';

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
      new DataView(data.buffer),
    );

    await BleClient.disconnect(device.deviceId);
    bluetoothStatus.value = 'success';
    toast.add({ title: 'Bluetooth printer test sent', color: 'green' });
  } catch (err: any) {
    console.error('Print failed:', err.message);
    bluetoothStatus.value = 'error';
    toast.add({
      title: 'Bluetooth printer test failed',
      description: err.message,
      color: 'red',
    });
  }
};

const {
  isWebUsbSupported,
  getSavedWebUsbPrinters,
  getWebUsbPrinterRoles,
  connectUsbPrinter,
  assignWebUsbPrinterRole,
  clearWebUsbPrinterRole,
  removeSavedWebUsbPrinter,
  printBillViaUsb,
  printLabelViaUsb,
} = useWebUsbPrinter();

const webUsbPrinters = ref<any[]>([]);
const webUsbRoles = ref<{ receipt: string | null; barcode: string | null }>({
  receipt: null,
  barcode: null,
});
const webUsbStatus = ref('');
const webUsbSupported = computed(() => isWebUsbSupported());
const showWebUsbSection = computed(() => !Capacitor.isNativePlatform());

const refreshWebUsbState = () => {
  webUsbPrinters.value = getSavedWebUsbPrinters();
  webUsbRoles.value = getWebUsbPrinterRoles();
};

const connectWebUsbPrinter = async () => {
  webUsbStatus.value = 'connecting';
  try {
    const printer = await connectUsbPrinter();
    refreshWebUsbState();
    toast.add({
      title: 'WebUSB printer connected',
      description: printer.productName || 'USB Printer',
      color: 'green',
    });
  } catch (error: any) {
    if (error?.name !== 'NotFoundError') {
      toast.add({
        title: 'Unable to connect WebUSB printer',
        description: error?.message || 'Unknown error',
        color: 'red',
      });
    }
  } finally {
    webUsbStatus.value = '';
  }
};

const toggleWebUsbRole = (printerId: string, role: 'receipt' | 'barcode') => {
  if (webUsbRoles.value[role] === printerId) {
    clearWebUsbPrinterRole(role);
  } else {
    assignWebUsbPrinterRole(printerId, role);
  }
  refreshWebUsbState();
};

const removeWebUsbPrinter = (printerId: string) => {
  removeSavedWebUsbPrinter(printerId);
  refreshWebUsbState();
};

const buildSampleReceipt = () => ({
  invoiceNumber: 'TEST-001',
  phone: useAuth().session.value?.companyPhone || '9999999999',
  thankYouNote: 'Printer test',
  refundPolicy: 'No refund on test print',
  returnPolicy: 'Exchange within 7 days',
  date: new Date().toISOString(),
  entries: [
    {
      description: 'USB printer sample',
      hsn: '0000',
      qty: 1,
      mrp: 99,
      discount: 0,
      tax: 0,
      value: 99,
      tvalue: 99,
    },
  ],
  subtotal: 99,
  discount: '10',
  grandTotal: 99,
  paymentMethod: 'Cash',
  companyName: useAuth().session.value?.companyName || 'Store',
  companyAddress: useAuth().session.value?.address || {},
  gstin: useAuth().session.value?.gstin || '',
  clientName: 'Printer Test',
  clientPhone: '9999999999',
  tqty: 1,
  tvalue: 99,
  ttvalue: 99,
  tdiscount: 0,
  upiId: useAuth().session.value?.upiId || '',
});

const buildSampleLabel = () => [
  {
    barcode: '313063057461',
    code: 'TEST',
    shopname: useAuth().session.value?.companyName || 'Store',
    productName: 'USB Label Test',
    brand: 'Printer',
    name: 'Sample',
    sprice: 1440,
    dprice: 1299,
    size: 'M',
  },
];

const testWebUsbReceiptPrinter = async () => {
  webUsbStatus.value = 'testing-receipt';
  try {
    await printBillViaUsb(buildSampleReceipt());
    toast.add({ title: 'Receipt printer test sent', color: 'green' });
  } catch (error: any) {
    toast.add({
      title: 'Receipt printer test failed',
      description: error?.message || 'Unknown error',
      color: 'red',
    });
  } finally {
    webUsbStatus.value = '';
  }
};

const testWebUsbBarcodePrinter = async () => {
  webUsbStatus.value = 'testing-barcode';
  try {
    await printLabelViaUsb(buildSampleLabel(), selectedPrinterLabelSize.value || '50x25mm');
    toast.add({ title: 'Barcode printer test sent', color: 'green' });
  } catch (error: any) {
    toast.add({
      title: 'Barcode printer test failed',
      description: error?.message || 'Unknown error',
      color: 'red',
    });
  } finally {
    webUsbStatus.value = '';
  }
};

const getWebUsbRoleBadges = (printerId: string) => {
  const badges = [];
  if (webUsbRoles.value.receipt === printerId) badges.push('Receipt');
  if (webUsbRoles.value.barcode === printerId) badges.push('Barcode');
  return badges;
};

onMounted(async () => {
  refreshWebUsbState();

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
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="mb-8 pb-8 border-b-2 border-gray-300 dark:border-gray-600">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Label Settings</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Configure label size for barcode printing</p>

      <UFormGroup
        name="PrinterLabelSize"
        label="Printer Label Size"
        description="Your Store Printer Label Size"
        class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4"
        :ui="{ container: '' }"
      >
        <USelectMenu v-model="selectedPrinterLabelSize" :options="printerLabelSizes" placeholder="Select Printer Label Size" />
        <UButton
          class="my-2"
          type="submit"
          label="Save Printer Label Size"
          :loading="isUpdatingPrinterLabelSize"
          @click="onPrinterLabelSizeChange"
          :disabled="!isPrinterLabelSizeChanged"
        />
      </UFormGroup>
    </div>

    <div v-if="showWebUsbSection" class="mb-8 pb-8 border-b-2 border-gray-300 dark:border-gray-600">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">WebUSB Printers</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Configure browser printers for receipts and barcode labels. The same USB printer can be assigned to both roles.
      </p>

      <div v-if="!webUsbSupported" class="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">
        WebUSB is not available in this browser. Use a Chromium browser for browser-based USB printing, or keep using the local print service.
      </div>

      <template v-else>
        <div class="flex flex-wrap gap-4 mb-4">
          <UButton
            @click="connectWebUsbPrinter"
            :loading="webUsbStatus === 'connecting'"
            color="primary"
          >
            {{ webUsbStatus === 'connecting' ? 'Connecting...' : 'Add WebUSB Printer' }}
          </UButton>

          <UButton
            color="green"
            variant="soft"
            @click="testWebUsbReceiptPrinter"
            :disabled="!webUsbRoles.receipt"
            :loading="webUsbStatus === 'testing-receipt'"
          >
            {{ webUsbStatus === 'testing-receipt' ? 'Testing...' : 'Test Receipt Printer' }}
          </UButton>

          <UButton
            color="blue"
            variant="soft"
            @click="testWebUsbBarcodePrinter"
            :disabled="!webUsbRoles.barcode"
            :loading="webUsbStatus === 'testing-barcode'"
          >
            {{ webUsbStatus === 'testing-barcode' ? 'Testing...' : 'Test Barcode Printer' }}
          </UButton>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div class="rounded-lg border p-4">
            <div class="text-sm text-gray-500 dark:text-gray-400">Receipt Printer</div>
            <div class="font-medium text-gray-900 dark:text-white">
              {{ webUsbPrinters.find((printer) => printer.id === webUsbRoles.receipt)?.productName || 'Not selected' }}
            </div>
          </div>

          <div class="rounded-lg border p-4">
            <div class="text-sm text-gray-500 dark:text-gray-400">Barcode Printer</div>
            <div class="font-medium text-gray-900 dark:text-white">
              {{ webUsbPrinters.find((printer) => printer.id === webUsbRoles.barcode)?.productName || 'Not selected' }}
            </div>
          </div>
        </div>

        <div v-if="webUsbPrinters.length" class="border rounded-lg p-4">
          <h3 class="font-medium mb-3">Saved WebUSB Printers</h3>
          <div class="space-y-3">
            <div
              v-for="printer in webUsbPrinters"
              :key="printer.id"
              class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div>
                <div class="font-medium text-gray-900 dark:text-white">
                  {{ printer.productName || 'USB Printer' }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ printer.manufacturerName || 'Unknown maker' }} | VID {{ printer.vendorId }} PID {{ printer.productId }}
                </div>
                <div class="flex flex-wrap gap-2 mt-2">
                  <UBadge
                    v-for="badge in getWebUsbRoleBadges(printer.id)"
                    :key="`${printer.id}-${badge}`"
                    color="primary"
                    variant="soft"
                  >
                    {{ badge }}
                  </UBadge>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <UButton
                  variant="soft"
                  color="green"
                  size="sm"
                  @click="toggleWebUsbRole(printer.id, 'receipt')"
                >
                  {{ webUsbRoles.receipt === printer.id ? 'Clear Receipt' : 'Set Receipt' }}
                </UButton>

                <UButton
                  variant="soft"
                  color="blue"
                  size="sm"
                  @click="toggleWebUsbRole(printer.id, 'barcode')"
                >
                  {{ webUsbRoles.barcode === printer.id ? 'Clear Barcode' : 'Set Barcode' }}
                </UButton>

                <UButton
                  variant="soft"
                  color="red"
                  size="sm"
                  @click="removeWebUsbPrinter(printer.id)"
                >
                  Remove
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="rounded-lg border p-4 text-sm text-gray-500 dark:text-gray-400">
          No WebUSB printers saved yet. Add one here, then assign it to receipt and/or barcode printing.
        </div>
      </template>
    </div>

    <div class="mb-8 pb-8 border-b-2 border-gray-300 dark:border-gray-600">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Bluetooth Printers</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Scan, pair, and manage your Bluetooth receipt printers</p>

      <div class="flex gap-4 mb-4">
        <UButton
          @click="scanDevices"
          :loading="bluetoothStatus === 'scanning'"
          :disabled="bluetoothStatus === 'printing'"
          color="primary"
        >
          {{ bluetoothStatus === 'scanning' ? 'Scanning...' : 'Scan Printers' }}
        </UButton>

        <UButton
          @click="sendTestPrint"
          :loading="bluetoothStatus === 'printing'"
          :disabled="!selectedDevice"
          color="green"
        >
          {{ bluetoothStatus === 'printing' ? 'Printing...' : 'Send Test Print' }}
        </UButton>
      </div>

      <div v-if="savedPrinters.length" class="border rounded-lg p-4 mb-4">
        <h3 class="font-medium mb-2">My Printers</h3>
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

      <div v-if="devices.length" class="border rounded-lg p-4">
        <h3 class="font-medium mb-2">Available Printers</h3>
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
  </UDashboardPanelContent>
</template>
