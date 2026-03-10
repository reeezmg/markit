import Quagga from '@ericblade/quagga2'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core'

/**
 * Manages barcode scanning for billing:
 * - Web: Quagga2 live camera stream
 * - Native: CapacitorBarcodeScanner (CODE_128 only)
 *
 * @param onBarcodeScanned  Called with the validated barcode string when a scan succeeds.
 *                          Caller is responsible for updating items + fetching item data.
 */
export function useBillingCamera(onBarcodeScanned: (barcode: string) => void) {
  const toast = useToast()

  const showCamera = ref(false)
  const videoRef = ref<HTMLElement | null>(null)
  const result = ref('')

  // ─── Permission helpers ────────────────────────────────────────────────────

  const requestCameraAccess = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'environment' } },
      })
    } catch (err) {
      console.error('🚫 Error accessing camera:', err)
      toast.add({
        title: 'Camera Access Blocked',
        description: 'Unable to access camera. Please allow permission from your browser settings.',
        color: 'red',
      })
    }
  }

  const askCameraPermission = async () => {
    if (!('permissions' in navigator)) return requestCameraAccess()
    try {
      const res = await navigator.permissions.query({ name: 'camera' as PermissionName })
      if (res.state !== 'granted') requestCameraAccess()
    } catch (e) {
      console.warn('❗Permissions API error:', e)
      requestCameraAccess()
    }
  }

  // ─── Web camera (Quagga2) ──────────────────────────────────────────────────

  const stopCamera = () => {
    try {
      Quagga.stop()
      Quagga.offDetected()
      result.value = ''
    } catch (e) {
      console.warn('⚠️ Error while stopping Quagga:', e)
    }
    showCamera.value = false
  }

  const startCamera = async () => {
    await askCameraPermission()
    result.value = ''
    showCamera.value = true

    try {
      await nextTick()

      Quagga.init(
        {
          inputStream: {
            type: 'LiveStream',
            target: videoRef.value,
            constraints: { facingMode: 'environment' },
          },
          locator: { patchSize: 'medium', halfSample: true },
          decoder: { readers: ['code_128_reader', 'ean_reader', 'ean_8_reader'] },
          locate: true,
        },
        (err: Error | null) => {
          if (err) {
            console.error('Quagga init error:', err)
            toast.add({ title: 'Camera Error', description: err.message, color: 'red' })
            return
          }
          Quagga.start()
        }
      )

      Quagga.onDetected((data: any) => {
        const scanned = data?.codeResult?.code
        if (!scanned) return
        result.value = scanned
        stopCamera()
        onBarcodeScanned(scanned)
      })
    } catch (err: any) {
      console.error('Camera access error:', err)
      if (err.name === 'NotAllowedError') {
        toast.add({
          title: 'Camera Permission Denied',
          description: 'Please allow camera access in your browser settings.',
          color: 'red',
          icon: 'i-heroicons-exclamation-triangle',
        })
      } else if (err.name === 'NotFoundError') {
        toast.add({
          title: 'No Camera Found',
          description: 'We could not detect a camera on this device.',
          color: 'orange',
          icon: 'i-heroicons-video-camera-slash',
        })
      } else {
        toast.add({
          title: 'Unexpected Error',
          description: err.message || 'Something went wrong while accessing the camera.',
          color: 'gray',
          icon: 'i-heroicons-bug-ant',
        })
      }
      stopCamera()
    }
  }

  // ─── Native scanner (Capacitor) ────────────────────────────────────────────

  const scanCode128 = async () => {
    try {
      const scanResult = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.CODE_128,
        scanInstructions: 'Align barcode within the frame',
      })

      if (scanResult.ScanResult) {
        const pattern = /^\d+[A-Z]\d{6}$/
        if (!pattern.test(scanResult.ScanResult)) {
          toast.add({ title: 'Scanned Barcode Is Invalid!', color: 'red' })
          return
        }
        onBarcodeScanned(scanResult.ScanResult)
      }
    } catch (err) {
      console.error('🚫 Scan error:', err)
    }
  }

  // ─── Public dispatcher ─────────────────────────────────────────────────────

  const handleScan = () => {
    if (Capacitor.isNativePlatform()) {
      scanCode128()
    } else {
      startCamera()
    }
  }

  onUnmounted(() => {
    stopCamera()
  })

  return {
    showCamera,
    videoRef,
    handleScan,
    stopCamera,
  }
}
