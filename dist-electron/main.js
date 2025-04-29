import { app as e, BrowserWindow as l } from "electron";
import * as s from "path";
const a = !e.isPackaged;
function r() {
  const o = new l({
    width: 1e3,
    height: 700,
    webPreferences: {
      nodeIntegration: !1,
      contextIsolation: !0
      // preload: path.join(__dirname, 'preload.js'), // only if you use it
    }
  }), n = process.env.VITE_DEV_SERVER_URL || "http://localhost:3000", t = `file://${s.join(__dirname, "../.output/public/index.html")}`;
  o.loadURL(a ? n : t), o.webContents.openDevTools(), o.webContents.on("did-finish-load", () => {
    console.log("Nuxt app loaded in Electron");
  }), o.webContents.on("did-fail-load", (c, i, d) => {
    console.error("Failed to load:", i, d);
  });
}
e.whenReady().then(r);
