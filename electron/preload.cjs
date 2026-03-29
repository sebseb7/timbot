const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timbot', {
  getEnv: () => ipcRenderer.invoke('get-env'),
  startBot: (envVars) => ipcRenderer.invoke('start-bot', envVars),
  stopBot: () => ipcRenderer.invoke('stop-bot'),
  minimize: () => ipcRenderer.send('minimize-window'),
  getAutoStart: () => ipcRenderer.invoke('get-autostart'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  onBotOutput: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('bot-output', listener);
    return () => ipcRenderer.removeListener('bot-output', listener);
  },
  onBotExited: (callback) => {
    const listener = (_event, code) => callback(code);
    ipcRenderer.on('bot-exited', listener);
    return () => ipcRenderer.removeListener('bot-exited', listener);
  },
});
