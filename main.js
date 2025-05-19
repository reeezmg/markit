const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createServer } = require('http');

let win;

async function startNuxtServer() {
  const { createApp } = await import(path.join(__dirname, 'dist/server/index.mjs'));
  const { server: handler } = await createApp();

  // Start Nuxt's Nitro server on port 3000
  const httpServer = createServer(handler.nodeHandler);
  return new Promise((resolve) => {
    httpServer.listen(3000, () => {
      console.log('✅ Nuxt server started on http://localhost:3000');
      resolve();
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
    },
  });

  // Load Nuxt client
  win.loadURL('http://localhost:3000');
}

app.whenReady().then(async () => {
  await startNuxtServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
