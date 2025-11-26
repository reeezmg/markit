let audio: HTMLAudioElement | null = null
let unlocked = false

export function useBillEvents() {
  const BillStore = useBillStore()
  const { $socket } = useNuxtApp()

  const handleBillSuccess = (data: any) => {
    console.log("✅ Bill success received:", data)

    BillStore.notifyUpdate()

    // If audio is not initialized, skip to avoid crash
    if (!audio) {
      console.warn("Audio not initialized yet")
      return
    }

    // Try playing
    audio.play().catch((err) => {
      console.warn("Audio playback failed:", err)
    })
  }

  onMounted(() => {
    // Initialize the audio only once
    if (!audio) {
      audio = new Audio('/sounds/alert.mp3') // 👈 your MP3 path
      audio.volume = 1.0
    }

    // Required: Unlock audio after a user click (autoplay rules)
    const unlock = () => {
      if (audio && !unlocked) {
        audio.play().then(() => {
          audio!.pause()
          unlocked = true
          window.removeEventListener("click", unlock)
          console.log("🔓 Audio unlocked for playback")
        }).catch(() => {
          console.warn("Click did not unlock audio yet")
        })
      }
    }

    window.addEventListener("click", unlock)

    // Listen to socket event
    $socket.on("bill:success", handleBillSuccess)
  })

  onBeforeUnmount(() => {
    $socket.off("bill:success", handleBillSuccess)
  })
}
