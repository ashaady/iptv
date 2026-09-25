const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  isDesktop: true,
  openInVlc: (streamUrl, title) => ipcRenderer.invoke("OPEN_VLC", { streamUrl, title }),
  openVlc: (streamUrl, title) => ipcRenderer.invoke("OPEN_VLC", { streamUrl, title }),
  toggleFullScreen: () => ipcRenderer.invoke("TOGGLE_FULLSCREEN"),
  minimize: () => ipcRenderer.invoke("MINIMIZE_WINDOW"),
  maximize: () => ipcRenderer.invoke("MAXIMIZE_WINDOW"),
  close: () => ipcRenderer.invoke("CLOSE_WINDOW"),
  setKeepAwake: (keepAwake) => ipcRenderer.invoke("SET_KEEP_AWAKE", keepAwake),
});
