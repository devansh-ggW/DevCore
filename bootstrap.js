const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
let initialFilePath = null;

function findFileArgument(argv) {
  for (let i = argv.length - 1; i >= 1; i -= 1) {
    const raw = String(argv[i] || '').trim();
    if (!raw || raw.startsWith('-')) continue;
    const candidate = raw.replace(/^\"|\"$/g, '');
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

function writeReg(key, valueName, value) {
  try {
    const args = ['add', key, '/v', valueName, '/t', 'REG_SZ', '/d', value, '/f'];
    execFileSync('reg.exe', args, { windowsHide: true, stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function deleteRegKey(key) {
  try {
    execFileSync('reg.exe', ['delete', key, '/f'], { windowsHide: true, stdio: 'ignore' });
  } catch (_) {}
}

function registerWindowsFileAssociations() {
  if (process.platform !== 'win32') return;

  const exePath = process.execPath;
  const exeName = path.basename(exePath);
  const command = `\"${exePath}\" \"%1\"`;
  const classes = 'HKCU\\Software\\Classes';
  const appKey = `${classes}\\Applications\\${exeName}`;

  // Friendly name + standard Open With registration.
  writeReg(appKey, 'FriendlyAppName', 'DevCore');
  writeReg(`${appKey}\\shell\\open\\command`, '', command);

  const supported = [
    '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.html', '.htm',
    '.css', '.py', '.java', '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.rs',
    '.xml', '.yaml', '.yml', '.sql', '.bat', '.cmd', '.ps1', '.vue', '.svelte'
  ];
  for (const ext of supported) {
    writeReg(`${appKey}\\SupportedTypes`, ext, '');
  }

  // Direct right-click entry as a fallback.
  const shellKey = `${classes}\\*\\shell\\DevCore`;
  writeReg(shellKey, '', 'Open with DevCore');
  writeReg(shellKey, 'Icon', exePath);
  writeReg(`${shellKey}\\command`, '', command);
}

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

  app.whenReady().then(() => {
    // Register in HKCU on every launch so this works even when the installer
    // was not run as administrator and when DevCore is launched from a portable build.
    registerWindowsFileAssociations();
  });

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
