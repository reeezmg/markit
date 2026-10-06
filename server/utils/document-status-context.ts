import type { H3Event } from 'h3'

/** Call inside the write transaction; SET LOCAL prevents pooled-connection leaks. */
export async function setDocumentStatusContext(event: H3Event, db: any, source: string) {
  const session = await useAuthSession(event)
  await db.query(
    `SELECT set_config('app.status_source', $1, true), set_config('app.status_actor', $2, true)`,
    [source, session.data?.id ? `user:${session.data.id}` : ''],
  )
}
