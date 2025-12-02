

export function useLocalStorageRef<T>(key: string, defaultValue: T, prefix: string) {
  const lsKey = `${prefix}_${key}`

  // Use useState for SSR-safe initial state
  const data = useState(lsKey, () => defaultValue)

  onMounted(() => {
    const stored = localStorage.getItem(lsKey)
    if (stored) {
      try {
        data.value = JSON.parse(stored)
      } catch (_) {}
    }

    watch(
      data,
      (v) => {
        localStorage.setItem(lsKey, JSON.stringify(v))
      },
      { deep: true }
    )
  })

  return data
}
