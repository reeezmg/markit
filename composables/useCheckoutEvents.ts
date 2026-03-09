let audio: HTMLAudioElement | null = null
let unlocked = false

export function useCheckoutEvents() {
  const checkoutStore = useCheckoutStore()
  const { $socket } = useNuxtApp()

  const handleCheckoutSuccess = (data: any) => {
    checkoutStore.notifyUpdate()

    if (!audio) return

    audio.currentTime = 0
    audio.play().catch(() => {})
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
          audio!.currentTime = 0
          unlocked = true
          window.removeEventListener("click", unlock)
        }).catch(() => {})
      }
    }

    window.addEventListener("click", unlock)

    // Listen to socket event
    $socket.on("checkout:success", handleCheckoutSuccess)
  })

  onBeforeUnmount(() => {
    $socket.off("checkout:success", handleCheckoutSuccess)
  })
}
