import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('sahayak', {
  platform: process.platform,
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  close: () => ipcRenderer.invoke('close-window'),
})
