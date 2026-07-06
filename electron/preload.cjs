const { contextBridge, ipcRenderer } = require('electron')

const invokeClean = async (channel, ...args) => {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (error) {
    const message = error?.message || String(error)
    const prefix = `Error invoking remote method '${channel}': `
    throw new Error(message.startsWith(prefix) ? message.slice(prefix.length) : message)
  }
}

contextBridge.exposeInMainWorld('linguaFloat', {
  platform: 'windows',
  onSelectionText: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('selection-text', listener)
    return () => ipcRenderer.off('selection-text', listener)
  },
  translateLong: (text, settings) => invokeClean('translate:long', text, settings),
  loadSettings: () => invokeClean('settings:load'),
  saveSettings: (settings) => invokeClean('settings:save', settings),
  lookupWord: (candidates) => invokeClean('dict:lookup-word', candidates),
  getWatchState: () => invokeClean('watch:get-state'),
  setWatchEnabled: (enabled) => invokeClean('watch:set-enabled', enabled),
  setWatchHotkey: (hotkey) => invokeClean('watch:set-hotkey', hotkey),
  onWatchState: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('watch-state', listener)
    return () => ipcRenderer.off('watch-state', listener)
  },
  copy: (text) => ipcRenderer.invoke('clipboard:copy', text),
  hideWindow: () => ipcRenderer.send('window:hide'),
  resize: (size) => ipcRenderer.send('window:resize', size),
})
