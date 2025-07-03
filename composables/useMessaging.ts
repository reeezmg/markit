export async function useMessaging() {
  if (!process.client) return null

  const { getMessaging } = await import('firebase/messaging')
  const { app } = await import('./firebase')
  return getMessaging(app)
}
