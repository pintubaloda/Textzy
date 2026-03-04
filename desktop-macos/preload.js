const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("TextzyDesktop", {
  platform: "macos",
  version: "1.0.0"
});
