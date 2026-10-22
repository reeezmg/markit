<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { PRINTER_SERVICES, selectedBluetoothPrinter, useReceiptPrinter, type BluetoothPrinter } from '~/composables/useReceiptPrinter';
const props = defineProps<{ receiptData: any; labelData: any; settingsDirty: boolean }>();
const saved = ref<BluetoothPrinter[]>([]);
const discovered = ref<BluetoothPrinter[]>([]);
const selected = ref<BluetoothPrinter | null>(null);
const scanning = ref(false);
const busy = ref(false);
const error = ref('');
const message = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const printers = computed(() => [...saved.value, ...discovered.value.filter(p => !saved.value.some(s => s.deviceId === p.deviceId))]);
const printer = useReceiptPrinter();
onMounted(() => {
  selected.value = selectedBluetoothPrinter();
  try {
    const stored = JSON.parse(localStorage.getItem('savedPrinters') || '[]');
    saved.value = Array.isArray(stored) ? stored.filter(p => p?.deviceId) : [];
    if (selected.value && !saved.value.some(p => p.deviceId === selected.value?.deviceId)) saved.value.push(selected.value);
  } catch { saved.value = selected.value ? [selected.value] : []; }
});
async function stopScan() {
  clearTimeout(timer);
  if (scanning.value) {
    try { await BleClient.stopLEScan(); }
    catch (err: any) { if (!disposed) error.value = err.message || 'Could not stop Bluetooth discovery.'; }
    finally { scanning.value = false; }
  }
}
onBeforeUnmount(() => { disposed = true; void stopScan(); });
async function scan() {
  if (scanning.value || busy.value) return;
  error.value = ''; message.value = ''; discovered.value = []; scanning.value = true;
  try {
    await BleClient.initialize();
    if (disposed) return;
    await BleClient.requestLEScan({ services: [PRINTER_SERVICES.SERVICE], allowDuplicates: false }, result => {
      if (disposed || !scanning.value) return;
      const deviceId = result.device.deviceId;
      if (!discovered.value.some(p => p.deviceId === deviceId)) discovered.value.push({ deviceId, name: result.device.name || result.localName || 'Bluetooth printer' });
    });
    if (disposed) { await BleClient.stopLEScan(); scanning.value = false; return; }
    timer = setTimeout(() => { void stopScan(); }, 5000);
  } catch (err: any) { error.value = err.message || 'Bluetooth discovery failed.'; await stopScan(); }
}
function select(p: BluetoothPrinter) {
  error.value = ''; message.value = '';
  try {
    const next = saved.value.some(s => s.deviceId === p.deviceId) ? saved.value : [...saved.value, p];
    localStorage.setItem('savedPrinters', JSON.stringify(next));
    localStorage.setItem('selectedPrinter', JSON.stringify(p));
    saved.value = next; selected.value = p; message.value = 'Bluetooth printer selected.';
  } catch (err: any) { error.value = err.message || 'Could not save printer.'; }
}
function forget(p: BluetoothPrinter) {
  error.value = ''; message.value = '';
  try {
    const next = saved.value.filter(s => s.deviceId !== p.deviceId);
    localStorage.setItem('savedPrinters', JSON.stringify(next));
    if (selected.value?.deviceId === p.deviceId) { localStorage.removeItem('selectedPrinter'); selected.value = null; }
    saved.value = next;
  } catch (err: any) { error.value = err.message || 'Could not forget printer.'; }
}
async function test(kind: 'receipt' | 'label') {
  if (busy.value || props.settingsDirty) return;
  error.value = ''; message.value = ''; busy.value = true;
  try {
    await stopScan();
    if (kind === 'receipt') await printer.printMobileBill(props.receiptData);
    else await printer.printMobileLabel([props.labelData], '50x38mm');
    message.value = `Test ${kind} sent to Bluetooth printer.`;
  } catch (err: any) { error.value = err.message || 'Bluetooth print failed.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="bluetooth-settings" aria-labelledby="bluetooth-title">
    <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 id="bluetooth-title" class="text-lg font-semibold">Bluetooth Printers</h2><p class="text-sm text-gray-500">Mobile app printing uses the selected Bluetooth printer for receipts, labels and reports.</p></div><UButton label="Scan for printers" :loading="scanning" :disabled="scanning || busy" @click="scan" /></div>
    <p v-if="scanning" role="status" class="text-sm mt-3">Searching for nearby printers...</p>
    <p v-else-if="!printers.length" class="text-sm text-gray-500 mt-3">Turn on your Bluetooth printer, then scan to find it.</p>
    <div v-for="p in printers" :key="p.deviceId" class="flex flex-wrap items-center justify-between gap-3 border-b py-3"><span>{{ p.name }} <small v-if="selected?.deviceId === p.deviceId" class="text-green-700">Selected</small><small class="block text-gray-500">{{ p.deviceId }}</small></span><div class="flex gap-3"><UButton :label="selected?.deviceId === p.deviceId ? 'Selected' : 'Select printer'" :disabled="busy || selected?.deviceId === p.deviceId" variant="soft" @click="select(p)" /><UButton v-if="saved.some(s => s.deviceId === p.deviceId)" label="Forget" variant="ghost" color="red" :disabled="busy" @click="forget(p)" /></div></div>
    <div class="flex gap-3 mt-4"><UButton label="Test Bluetooth receipt" variant="soft" :disabled="!selected || busy || settingsDirty" @click="test('receipt')" /><UButton label="Test Bluetooth label" variant="soft" :disabled="!selected || busy || settingsDirty" @click="test('label')" /></div>
    <p v-if="settingsDirty" class="text-sm text-amber-700 mt-3">Save device settings before testing.</p>
    <p v-if="error" role="alert" class="text-sm text-red-600 mt-3">{{ error }}</p><p v-if="message" role="status" class="text-sm text-green-700 mt-3">{{ message }}</p>
  </section>
</template>
<style scoped>.bluetooth-settings { border:1px solid rgb(148 163 184 / .25); border-radius:16px; padding:24px; margin-bottom:24px; }</style>
