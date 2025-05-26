const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

// Environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

let mainWindow
let nuxtServer = null

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false // Don't show until ready
  })

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    // In development, use the Nuxt dev server
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    // In production, serve the built files
    startNuxtServer()
    mainWindow.loadFile(path.join(__dirname, '../.output/public/index.html'))
  }

  // Show when ready
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow local URLs and block external ones
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
}

// Start Nuxt server in production
function startNuxtServer() {
  if (process.env.NODE_ENV !== 'production' || nuxtServer) return

  // Path to your Nuxt server (using .output/server for Nitro server)
  const serverPath = path.join(__dirname, '../.output/server/index.mjs')
  
  nuxtServer = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      NITRO_PORT: 3000,
      NITRO_HOST: 'localhost'
    },
    stdio: 'inherit'
  })

  nuxtServer.on('error', (err) => {
    console.error('Nuxt server failed to start:', err)
  })

  nuxtServer.on('close', (code) => {
    if (code !== 0) {
      console.error('Nuxt server exited with code:', code)
    }
  })
}

// Electron app lifecycle
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (mainWindow === null) createWindow()
  })
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopNuxtServer()
    app.quit()
  }
})

// Cleanup Nuxt server
function stopNuxtServer() {
  if (nuxtServer) {
    nuxtServer.kill()
    nuxtServer = null
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  stopNuxtServer()
  app.quit()
})

// IPC Communication Example
ipcMain.handle('get-app-path', () => {
  return app.getPath('userData')
})

// Security warnings
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault()
    }
  })
})