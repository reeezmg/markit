export const useCompanyEntries = async (startDate?: Date, endDate?: Date) => {
  const res = await $fetch('/api/user/report', {
    query: {
      startDate: startDate ? startDate.toISOString() : undefined,
      endDate: endDate ? endDate.toISOString() : undefined
    }
  })
  return res
}
