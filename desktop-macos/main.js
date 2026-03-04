const { app, BrowserWindow, session } = require("electron");
const path = require("path");

const SHELL_URL = "https://textzy-frontend-production.up.railway.app/?mobileShell=1&platform=macos";
const TRUSTED_HOST = "textzy-frontend-production.up.railway.app";

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: "Textzy",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} TextzyDesktopShell/1 TextzyMacShell/1`);
  win.webContents.loadURL(SHELL_URL);
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const host = new URL(details.url).host.toLowerCase();
      if (host !== TRUSTED_HOST && !host.endsWith(".gstatic.com") && !host.endsWith(".googleapis.com")) {
        callback({ cancel: true });
        return;
      }
    } catch {
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
