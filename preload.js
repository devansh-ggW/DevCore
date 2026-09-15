const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devcore', {
  openFile: () => ipcRenderer.invoke('open-file'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', { dirPath }),
  createFile: (dirPath, name) => ipcRenderer.invoke('create-file', { dirPath, name }),
  createFolder: (dirPath, name) => ipcRenderer.invoke('create-folder', { dirPath, name }),
  deletePath: (targetPath) => ipcRenderer.invoke('delete-path', { targetPath }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', { filePath }),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  saveFileAs: (content) => ipcRenderer.invoke('save-file-as', { content }),

  runCode: (filePath, language) => ipcRenderer.invoke('run-code', { filePath, language }),
  stopRun: () => ipcRenderer.invoke('stop-run'),
  terminalStart: (cwd) => ipcRenderer.invoke('terminal-start', { cwd }),
  terminalInput: (input) => ipcRenderer.invoke('terminal-input', { input }),
  terminalStop: () => ipcRenderer.invoke('terminal-stop'),
  checkSyntax: (content, language) => ipcRenderer.invoke('check-syntax', { content, language }),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  onWindowState: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('window-state', listener);
    return () => ipcRenderer.removeListener('window-state', listener);
  },

  onSyntaxDiagnostics: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('syntax-diagnostics', listener);
    return () => ipcRenderer.removeListener('syntax-diagnostics', listener);
  },

  onTerminalOutput: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('terminal-output', listener);
    return () => ipcRenderer.removeListener('terminal-output', listener);
  },
  onRunOutput: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('run-output', listener);
    return () => ipcRenderer.removeListener('run-output', listener);
  },
  onRunStatus: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('run-status', listener);
    return () => ipcRenderer.removeListener('run-status', listener);
  }
});
