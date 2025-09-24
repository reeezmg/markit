export function useCheckoutEvents(refetch: () => void) {
  const { $socket } = useNuxtApp()

  onMounted(() => {
    console.log("dadadad")
    $socket.on("checkout:success", (data) => {
      console.log("Checkout success:", data)

      // Run your page's refetch
      refetch()

      // Play alarm
      const audio = new Audio("/sounds/alert.mp3")
      audio.play()
    })
  })

  onBeforeUnmount(() => {
    $socket.off("checkout:success")
  })
}
