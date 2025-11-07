let audio: HTMLAudioElement | null = null
let unlocked = false

export function useCheckoutEvents(refetch: () => void) {
  const { $socket } = useNuxtApp()

  onMounted(() => {
    // unlock audio on first interaction
    const unlock = () => {
      if (!audio) audio = new Audio("/sounds/alert.mp3")
      audio.play().then(() => {
        audio!.pause()
        audio!.currentTime = 0
        unlocked = true
        window.removeEventListener("click", unlock)
      }).catch(() => {})
    }

    window.addEventListener("click", unlock)

    $socket.on("checkout:success", (data) => {
      console.log("Checkout success:", data)

      refetch()

      if (unlocked && audio) {
        audio.currentTime = 0
        audio.play()
      }
    })
  })

  onBeforeUnmount(() => {
    $socket.off("checkout:success")
  })
}
