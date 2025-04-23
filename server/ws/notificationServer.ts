// // server/ws/notificationServer.ts
// import { WebSocketServer,  WebSocket } from 'ws'

// import { PrismaClient, type Notification } from '@prisma/client'



// const prisma = new PrismaClient()
// const wss = new WebSocketServer({ port: 3003 })

// // Track connected clients by companyId
// const clients = new Map<string, Set<WebSocket>>()

// wss.on('connection', (ws, req) => {
//   const url = new URL(req.url || '', `ws://${req.headers.host}`)
//   const companyId = url.searchParams.get('companyId')

//   if (!companyId) {
//     ws.close(4001, 'Missing companyId')
//     return
//   }

//   if (!clients.has(companyId)) {
//     clients.set(companyId, new Set())
//   }
//   clients.get(companyId)?.add(ws)

//   let isAlive = true
//   const heartbeatInterval = setInterval(() => {
//     if (!isAlive) return ws.terminate()
//     isAlive = false
//     ws.ping()
//   }, 30000)

//   ws.on('pong', () => { isAlive = true })

//   ws.on('close', () => {
//     clearInterval(heartbeatInterval)
//     clients.get(companyId)?.delete(ws)
//     if (clients.get(companyId)?.size === 0) {
//       clients.delete(companyId)
//     }
//   })
// })

// export function broadcastNotification(notification: Notification) {
//   const companyClients = clients.get(notification.companyId)
//   if (!companyClients) return

//   const message = JSON.stringify(notification)
//   for (const client of companyClients) {
//     if (client.readyState === WebSocket.OPEN) {
//       client.send(message)
//     }
//   }
// }

// // Prisma middleware for notifications
// prisma.$use(async (params, next) => {
//   const result = await next(params)


//   if (params.model === 'Bill' && params.action === 'create') {
//     console.log('[Prisma Middleware] Creating notification for new bill:', result.id);
//     try {}
//     const order = result as { id: string; companyId: string; invoiceNumber?: number }
//     const notification = await prisma.notification.create({
//       data: {
//         companyId: order.companyId,
//         type: 'ORDER_RECEIVED',
//         title: 'New Order Received',
//         message: `Order #${order.invoiceNumber ?? 'N/A'} has been placed`,
//         actionPath: `/orders/${order.id}`,
//       },
//     })
//     broadcastNotification(notification)
//   }

//   return result
// })



// export { prisma }


// server/ws/notificationServer.ts
import { WebSocketServer, WebSocket } from 'ws'
import { PrismaClient, type Notification } from '@prisma/client'

// Initialize Prisma Client
const prisma = new PrismaClient()
const wss = new WebSocketServer({ port: 3005 })

// Track connected clients by companyId
const clients = new Map<string, Set<WebSocket>>()

// WebSocket Server Setup
wss.on('connection', (ws, req) => {
  // Extract companyId from URL
  const url = new URL(req.url || '', `ws://${req.headers.host}`)
  const companyId = url.searchParams.get('companyId')

  if (!companyId) {
    console.warn('Rejected connection - missing companyId')
    ws.close(4001, 'Missing companyId')
    return
  }

  // Initialize client set for company if not exists
  if (!clients.has(companyId)) {
    clients.set(companyId, new Set())
  }
  
  // Add client to company's set
  clients.get(companyId)?.add(ws)
  console.log(`New client connected for company ${companyId}. Total clients: ${clients.get(companyId)?.size}`)

  // Heartbeat setup
  let isAlive = true
  const heartbeatInterval = setInterval(() => {
    if (!isAlive) {
      console.log(`Terminating inactive connection for company ${companyId}`)
      return ws.terminate()
    }
    isAlive = false
    ws.ping()
  }, 30000) // 30 seconds

  // Event handlers
  ws.on('pong', () => { 
    isAlive = true 
  })

  ws.on('close', () => {
    console.log(`Client disconnected for company ${companyId}`)
    clearInterval(heartbeatInterval)
    clients.get(companyId)?.delete(ws)
    
    // Clean up empty company sets
    if (clients.get(companyId)?.size === 0) {
      clients.delete(companyId)
    }
  })

  ws.on('error', (error) => {
    console.error(`WebSocket error for company ${companyId}:`, error)
  })
})

/**
 * Broadcasts a notification to all connected clients of a company
 */
export function broadcastNotification(notification: Notification) {
  const companyId = notification.companyId
  const companyClients = clients.get(companyId)

  if (!companyClients) {
    console.log(`No connected clients for company ${companyId}`)
    return
  }

  const message = JSON.stringify({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    actionPath: notification.actionPath,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
    metadata: notification.metadata
  })

  let delivered = 0
  companyClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message)
        delivered++
      } catch (error) {
        console.error('Failed to send notification to client:', error)
      }
    }
  })

  console.log(`Notification ${notification.id} broadcast to ${delivered}/${companyClients.size} clients for company ${companyId}`)
}

// Prisma Middleware for automatic notifications
prisma.$use(async (params, next) => {
  // First execute the original operation
  const result = await next(params)

  // Handle Bill creation
  if (params.model === 'Bill' && params.action === 'create') {
    try {
      const notification = await prisma.notification.create({
        data: {
          companyId: result.companyId,
          type: 'ORDER_RECEIVED',
          title: 'New Bill Created',
          message: `Bill #${result.invoiceNumber || 'N/A'} for ${result.grandTotal}`,
          actionPath: `/bills/${result.id}`,
          metadata: {
            billId: result.id,
            amount: result.grandTotal
          }
        }
      })
      broadcastNotification(notification)
    } catch (error) {
      console.error('Failed to create bill notification:', error)
    }
  }

  // Handle Expense creation (if needed)
  if (params.model === 'Expense' && params.action === 'create') {
    try {
      const notification = await prisma.notification.create({
        data: {
          companyId: result.companyId,
          type: 'EXPENSE_CREATED',
          title: 'New Expense Recorded',
          message: `Expense: ${result.description || 'N/A'} (${result.amount})`,
          actionPath: `/expenses/${result.id}`,
          metadata: {
            expenseId: result.id,
            amount: result.amount
          }
        }
      })
      broadcastNotification(notification)
    } catch (error) {
      console.error('Failed to create expense notification:', error)
    }
  }

  return result
})

// Cleanup on server shutdown
process.on('SIGTERM', () => {
  console.log('Closing WebSocket server...')
  wss.clients.forEach(client => client.close())
  wss.close()
  prisma.$disconnect()
})

export { prisma }