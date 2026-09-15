const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
let initialFilePath = null;

function findFileArgument(argv) {
  for (let i = argv.length - 1; i >= 1; i -= 1) {
    const raw = String(argv[i] || '').trim();
    if (!raw || raw.startsWith('-')) continue;
    const candidate = raw.replace(/^"|"$/g, '');
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return path.resolve(candidate);
      }
    } catch (_) {}
  }
  return null;
}

function readTextFile(filePath) {
  try {
    const target = path.resolve(String(filePath || ''));
    const stat = fs.statSync(target);
    if (!stat.isFile()) return { success: false, error: 'The selected path is not a file.' };
    if (stat.size > MAX_TEXT_FILE_BYTES) {
      return { success: false, error: 'File is larger than 2 MB. Open it from inside a workspace instead.' };
    }

    const buffer = fs.readFileSync(target);
    if (buffer.includes(0)) {
      return { success: false, error: 'This looks like a binary file. DevCore only opens text/code files.' };
    }

    return { success: true, filePath: target, content: buffer.toString('utf8') };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

ipcMain.handle('open-file-path', (event, { filePath }) => readTextFile(filePath));

function deliverExternalFile(win, filePath) {
  if (!win || win.isDestroyed()) return;

  const result = readTextFile(filePath);
  const payload = JSON.stringify(result);

  const script = `(() => {
    const result = ${payload};
    const tryOpen = () => {
      if (result.success && typeof window.loadFile === 'function') {
        const modelsReady = window.monaco?.editor?.getModels?.()?.length > 0;
        if (modelsReady) {
          window.loadFile(result.filePath, result.content);
          return true;
        }
      }
      return false;
    };

    if (!tryOpen()) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (tryOpen() || attempts >= 80) clearInterval(timer);
      }, 100);
    }
  })();`;

  win.webContents.executeJavaScript(script).catch(() => {});
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  initialFilePath = findFileArgument(process.argv);

  app.on('second-instance', (event, commandLine) => {
    const filePath = findFileArgument(commandLine);
    const win = BrowserWindow.getAllWindows()[0];

    if (!win) return;

    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();

    if (filePath) deliverExternalFile(win, filePath);
  });

  app.on('browser-window-created', (event, win) => {
    // Show the shell as soon as the DOM is ready instead of waiting for the
    // heavier Monaco editor to finish initializing.
    win.webContents.once('dom-ready', () => {
      if (!win.isDestroyed()) win.show();
    });

    if (!initialFilePath) return;
    const filePath = initialFilePath;
    initialFilePath = null;

    const send = () => deliverExternalFile(win, filePath);
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
    else send();
  });

  require('./main.js');
}
