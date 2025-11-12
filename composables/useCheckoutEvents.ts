let audio: HTMLAudioElement | null = null
let unlocked = false

export function useCheckoutEvents() {
  const checkoutStore = useCheckoutStore()
  const { $socket } = useNuxtApp()

  const unlockAudio = () => {
    if (!audio) audio = new Audio("/sounds/alert.mp3")
    audio.play().then(() => {
      audio.pause()
      audio.currentTime = 0
      unlocked = true
      window.removeEventListener("click", unlockAudio)
      console.log("🔓 Audio unlocked for alerts")
    }).catch(() => {
      // Silently ignore (browser may block before user interaction)
    })
  }

  const handleCheckoutSuccess = (data: any) => {
    console.log("✅ Checkout success received:", data)

    // Trigger store logic
    checkoutStore.notifyUpdate()

    // Play alert sound if unlocked
    if (unlocked && audio) {
      audio.currentTime = 0
      audio.play().catch(err => console.warn("Audio playback failed:", err))
    }
  }

  onMounted(() => {
    // Unlock audio on first interaction
    window.addEventListener("click", unlockAudio, { once: true })

    // Listen to socket event
    $socket.on("checkout:success", handleCheckoutSuccess)
  })

  onBeforeUnmount(() => {
    $socket.off("checkout:success", handleCheckoutSuccess)
    window.removeEventListener("click", unlockAudio)
  })
}
