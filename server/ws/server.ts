// server/ws/server.ts
import { WebSocketServer , WebSocket } from 'ws'
import type { Notification } from '@prisma/client'

const wss = new WebSocketServer({ port: 3003 })
const clients = new Map<string, Set<WebSocket>>()

export function broadcastToCompany(companyId: string, notification: Notification) {
  const companyClients = clients.get(companyId)
  if (!companyClients) return

  const message = JSON.stringify({
    ...notification,
    createdAt: notification.createdAt.toISOString()
  })

  companyClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `ws://${req.headers.host}`)
  const companyId = url.searchParams.get('companyId')

  if (!companyId) {
    ws.close(4001, 'Missing companyId')
    return
  }

  if (!clients.has(companyId)) {
    clients.set(companyId, new Set())
  }
  clients.get(companyId)!.add(ws)

  ws.on('close', () => {
    clients.get(companyId)?.delete(ws)
    if (clients.get(companyId)?.size === 0) {
      clients.delete(companyId)
    }
  })
})

export { wss }