export const useDb = () => {
  const db = inject('db')
  if (!db) throw new Error('DB not injected')
  return db
}
