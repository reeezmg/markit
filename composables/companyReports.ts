export const useCompanyEntries = async (startDate?: Date, endDate?: Date) => {
  console.log(startDate,endDate)
  const { data } = await useFetch('/api/user/report', {
    query: {
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString()
    }
  })
  return data.value || []
}
