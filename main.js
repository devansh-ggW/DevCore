const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;

// Currently running user process (compile step or the program itself), if any.
let runningProcess = null;
let terminalProcess = null;
let workspaceRoot = null;

// ─────────────────────────────────────────────
// WINDOW
// ─────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,

    // DevCore application icon
    icon: path.join(__dirname, 'icon.ico'),

    // DevCore owns the title bar so the window controls match the editor UI.
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',

    show: false,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show only after the UI is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Clean reference when window closes
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window-state', { maximized: true }));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-state', { maximized: false }));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─────────────────────────────────────────────
// WINDOW CONTROLS
// ─────────────────────────────────────────────

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
  return { success: true };
});

ipcMain.handle('window-toggle-maximize', () => {
  if (!mainWindow) return { maximized: false };
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return { maximized: mainWindow.isMaximized() };
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
  return { success: true };
});

// ─────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// ─────────────────────────────────────────────
// WORKSPACE / FILE TREE
// ─────────────────────────────────────────────

function safeWorkspacePath(target) {
  if (!workspaceRoot || !target) return null;
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(target);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) return null;
  return resolved;
}

ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Workspace',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  workspaceRoot = result.filePaths[0];
  return { success: true, path: workspaceRoot, name: path.basename(workspaceRoot) };
});

ipcMain.handle('list-directory', async (event, { dirPath }) => {
  const target = safeWorkspacePath(dirPath || workspaceRoot);
  if (!target) return { success: false, error: 'Invalid workspace path.' };
  try {
    const entries = fs.readdirSync(target, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') || e.name === '.env')
      .map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
      .sort((a,b) => a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name));
    return { success: true, path: target, entries };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-file', async (event, { dirPath, name }) => {
  const dir = safeWorkspacePath(dirPath || workspaceRoot);
  if (!dir || !name || /[<>:"|?*]/.test(name) || name.includes('/') || name.includes('\\')) {
    return { success: false, error: 'Invalid file name.' };
  }
  try {
    fs.writeFileSync(path.join(dir, name), '', { flag: 'wx' });
    return { success: true, path: path.join(dir, name) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-folder', async (event, { dirPath, name }) => {
  const dir = safeWorkspacePath(dirPath || workspaceRoot);
  if (!dir || !name || /[<>:"|?*]/.test(name) || name.includes('/') || name.includes('\\')) {
    return { success: false, error: 'Invalid folder name.' };
  }
  try {
    const target = path.join(dir, name);
    fs.mkdirSync(target, { recursive: false });
    return { success: true, path: target };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-path', async (event, { targetPath }) => {
  const target = safeWorkspacePath(targetPath);
  if (!target || target === path.resolve(workspaceRoot)) return { success: false, error: 'Invalid path.' };
  try {
    fs.rmSync(target, { recursive: true, force: false });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─────────────────────────────────────────────
// PERSISTENT INTEGRATED TERMINAL
// ─────────────────────────────────────────────

function sendTerminalOutput(data) {
  if (mainWindow) mainWindow.webContents.send('terminal-output', { data: String(data) });
}

function startTerminal(cwd) {
  if (terminalProcess) {
    try { terminalProcess.kill(); } catch (_) {}
    terminalProcess = null;
  }

  const workingDir = (cwd && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory())
    ? cwd
    : (workspaceRoot || app.getPath('home'));

  const isWin = process.platform === 'win32';
  const command = isWin ? process.env.ComSpec : (process.env.SHELL || '/bin/bash');
  const args = isWin ? ['/Q', '/K'] : ['-i'];

  try {
    terminalProcess = spawn(command, args, {
      cwd: workingDir,
      windowsHide: true,
      env: { ...process.env }
    });
  } catch (error) {
    sendTerminalOutput(`DevCore terminal failed to start: ${error.message}\n`);
    return { success: false };
  }

  terminalProcess.stdout.on('data', data => sendTerminalOutput(data));
  terminalProcess.stderr.on('data', data => sendTerminalOutput(data));
  terminalProcess.on('error', error => sendTerminalOutput(`Terminal error: ${error.message}\n`));
  terminalProcess.on('close', () => { terminalProcess = null; });

  return { success: true, cwd: workingDir };
}

ipcMain.handle('terminal-start', (event, { cwd }) => startTerminal(cwd));

ipcMain.handle('terminal-input', (event, { input }) => {
  if (runningProcess && runningProcess.stdin && !runningProcess.stdin.destroyed) {
    runningProcess.stdin.write(String(input));
    return { success: true, target: 'process' };
  }
  if (terminalProcess && terminalProcess.stdin && !terminalProcess.stdin.destroyed) {
    terminalProcess.stdin.write(String(input));
    return { success: true, target: 'terminal' };
  }
  return { success: false, error: 'Terminal is not running.' };
});

ipcMain.handle('terminal-stop', () => {
  if (terminalProcess) {
    try { terminalProcess.kill(); } catch (_) {}
    terminalProcess = null;
  }
  return { success: true };
});

// ─────────────────────────────────────────────
// OPEN FILE
// ─────────────────────────────────────────────

ipcMain.handle('open-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open File',
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];

    const content = fs.readFileSync(filePath, 'utf8');

    return {
      success: true,
      filePath,
      content
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('read-file', async (event, { filePath }) => {
  const target = safeWorkspacePath(filePath);
  if (!target) return { success: false, error: 'Invalid workspace path.' };
  try { return { success: true, path: target, content: fs.readFileSync(target, 'utf8') }; }
  catch (error) { return { success: false, error: error.message }; }
});

// ─────────────────────────────────────────────
// SAVE FILE
// ─────────────────────────────────────────────

ipcMain.handle('save-file', async (event, { filePath, content }) => {
  try {
    if (!filePath) {
      return {
        success: false,
        error: 'No file path provided.'
      };
    }

    fs.writeFileSync(filePath, content, 'utf8');

    return {
      success: true,
      filePath
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// ─────────────────────────────────────────────
// SAVE AS
// ─────────────────────────────────────────────

ipcMain.handle('save-file-as', async (event, { content }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save File',
      properties: ['createDirectory']
    });

    if (result.canceled || !result.filePath) {
      return {
        success: false,
        canceled: true
      };
    }

    fs.writeFileSync(result.filePath, content, 'utf8');

    return {
      success: true,
      filePath: result.filePath
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// ─────────────────────────────────────────────
// LIVE SYNTAX CHECKING
// ─────────────────────────────────────────────

let syntaxCheckProcess = null;

function sendSyntaxDiagnostics(diagnostics) {
  if (mainWindow) {
    mainWindow.webContents.send('syntax-diagnostics', diagnostics);
  }
}

function parseLineNumber(text) {
  const patterns = [
    /line\s+(\d+)/i,
    /:(\d+)(?::\d+)?\)?\s*$/m,
    /\.(?:py|js|ts|json):(\d+)(?::\d+)?/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return Number(match[1]);
  }
  return 1;
}

function parseColumnNumber(text) {
  const patterns = [
    /:(\d+)\)?\s*$/m,
    /\.(?:py|js|ts|json):\d+:(\d+)/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return Number(match[1]);
  }
  return 1;
}

function syntaxMessage(output, language) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const interesting = lines.filter(line =>
    /SyntaxError|IndentationError|TabError|Unexpected token|Unexpected end|unterminated|expected/i.test(line)
  );
  if (interesting.length) {
    return interesting[interesting.length - 1]
      .replace(/^.*(?:SyntaxError|IndentationError|TabError):\s*/i, '')
      .trim();
  }
  return language === 'python' ? 'Python syntax error' : 'JavaScript syntax error';
}

function runSyntaxCommand(command, args, filePath) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, [...args, filePath], {
        windowsHide: true
      });
    } catch (error) {
      resolve({ unavailable: true, output: error.message });
      return;
    }

    let output = '';
    child.stdout?.on('data', data => output += data.toString());
    child.stderr?.on('data', data => output += data.toString());

    child.on('error', error => {
      resolve({ unavailable: error.code === 'ENOENT', output: error.message });
    });

    child.on('close', code => {
      resolve({ unavailable: false, code, output });
    });
  });
}

ipcMain.handle('check-syntax', async (event, { content, language }) => {
  if (syntaxCheckProcess) {
    try { syntaxCheckProcess.kill(); } catch (_) {}
    syntaxCheckProcess = null;
  }

  const supported = new Set(['python', 'javascript', 'json']);
  if (!supported.has(language)) return { diagnostics: [] };

  const ext = language === 'python' ? '.py' : language === 'javascript' ? '.js' : '.json';
  const checkDir = path.join(app.getPath('temp'), 'devcore-syntax');
  fs.mkdirSync(checkDir, { recursive: true });
  const filePath = path.join(checkDir, `check-${process.pid}-${Date.now()}${ext}`);

  try {
    fs.writeFileSync(filePath, content ?? '', 'utf8');

    let result;
    if (language === 'python') {
      result = await runSyntaxCommand(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'py_compile'], filePath);
      // Some Windows installations expose Python through the py launcher instead.
      if (result.unavailable && process.platform === 'win32') {
        result = await runSyntaxCommand('py', ['-3', '-m', 'py_compile'], filePath);
      }
    } else if (language === 'javascript') {
      result = await runSyntaxCommand('node', ['--check'], filePath);
    } else {
      // JSON has no external dependency.
      try {
        JSON.parse(content ?? '');
        result = { unavailable: false, code: 0, output: '' };
      } catch (error) {
        result = { unavailable: false, code: 1, output: error.message };
      }
    }

    if (result.unavailable) {
      return {
        diagnostics: [{
          severity: 'warning',
          line: 1,
          column: 1,
          endColumn: 2,
          message: `Live ${language} syntax checking is unavailable on this PC. Install the ${language === 'python' ? 'Python' : 'Node.js'} runtime to enable it.`
        }]
      };
    }

    if (result.code === 0) return { diagnostics: [] };

    const line = parseLineNumber(result.output);
    const column = parseColumnNumber(result.output);
    return {
      diagnostics: [{
        severity: 'error',
        line,
        column,
        endColumn: Math.max(column + 1, column + 2),
        message: syntaxMessage(result.output, language)
      }]
    };
  } catch (error) {
    return {
      diagnostics: [{
        severity: 'warning',
        line: 1,
        column: 1,
        endColumn: 2,
        message: `Syntax checker failed: ${error.message}`
      }]
    };
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) {}
    const cacheFile = language === 'python' ? filePath + 'c' : null;
    try { if (cacheFile) fs.unlinkSync(cacheFile); } catch (_) {}
  }
});

// ─────────────────────────────────────────────
// RUN / COMPILE
// ─────────────────────────────────────────────

function sendRunOutput(stream, data) {
  if (mainWindow) {
    mainWindow.webContents.send('run-output', { stream, data });
  }
}

function sendRunStatus(message) {
  if (mainWindow) {
    mainWindow.webContents.send('run-status', { message });
  }
}

// Runs a single command, streaming its stdout/stderr to the renderer as it
// arrives. Resolves once the process exits (or fails to start).
function runCommand(command, args, options) {
  return new Promise((resolve) => {
    let child;

    try {
      child = spawn(command, args, {
        ...options,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      sendRunOutput('stderr', `Failed to start "${command}": ${error.message}\n`);
      resolve({ success: false, missingTool: command });
      return;
    }

    runningProcess = child;

    child.on('error', (error) => {
      runningProcess = null;
      if (error.code === 'ENOENT') {
        sendRunOutput(
          'stderr',
          `"${command}" was not found. Make sure it is installed and available on your PATH.\n`
        );
        resolve({ success: false, missingTool: command });
      } else {
        sendRunOutput('stderr', `Error running "${command}": ${error.message}\n`);
        resolve({ success: false, missingTool: null });
      }
    });

    if (child.stdout) {
      child.stdout.on('data', (data) => sendRunOutput('stdout', data.toString()));
    }
    if (child.stderr) {
      child.stderr.on('data', (data) => sendRunOutput('stderr', data.toString()));
    }

    child.on('close', (code) => {
      runningProcess = null;
      resolve({ success: code === 0, code, missingTool: null });
    });
  });
}

function killRunningProcess() {
  if (!runningProcess) return;

  const pid = runningProcess.pid;

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (e) {
        runningProcess.kill('SIGTERM');
      }
    }
  } catch (error) {
    // Process may have already exited.
  }

  runningProcess = null;
}

ipcMain.handle('run-code', async (event, { filePath, language }) => {
  if (!filePath) {
    sendRunOutput('stderr', 'Save the file before running it.\n');
    return { success: false };
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const exeSuffix = process.platform === 'win32' ? '.exe' : '';

  let result = { success: false };

  switch (language) {
    case 'python': {
      result = await runCommand('python', [filePath], { cwd: dir });
      break;
    }

    case 'javascript': {
      result = await runCommand('node', [filePath], { cwd: dir });
      break;
    }

    case 'typescript': {
      sendRunStatus('Compiling with tsc...');
      const compile = await runCommand('tsc', [filePath], { cwd: dir });
      if (!compile.success) {
        result = compile;
        break;
      }
      sendRunStatus('Running...');
      const jsFile = path.join(dir, `${base}.js`);
      result = await runCommand('node', [jsFile], { cwd: dir });
      break;
    }

    case 'c': {
      const outFile = path.join(dir, `${base}${exeSuffix}`);
      sendRunStatus('Compiling with gcc...');
      const compile = await runCommand('gcc', [filePath, '-o', outFile], { cwd: dir });
      if (!compile.success) {
        result = compile;
        break;
      }
      sendRunStatus('Running...');
      result = await runCommand(outFile, [], { cwd: dir });
      break;
    }

    case 'cpp': {
      const outFile = path.join(dir, `${base}${exeSuffix}`);
      sendRunStatus('Compiling with g++...');
      const compile = await runCommand('g++', [filePath, '-o', outFile], { cwd: dir });
      if (!compile.success) {
        result = compile;
        break;
      }
      sendRunStatus('Running...');
      result = await runCommand(outFile, [], { cwd: dir });
      break;
    }

    case 'java': {
      sendRunStatus('Compiling with javac...');
      const compile = await runCommand('javac', [filePath], { cwd: dir });
      if (!compile.success) {
        result = compile;
        break;
      }
      sendRunStatus('Running...');
      result = await runCommand('java', ['-cp', dir, base], { cwd: dir });
      break;
    }

    case 'csharp': {
      sendRunStatus('Running with dotnet...');
      result = await runCommand('dotnet', ['run', '--project', dir], { cwd: dir });
      break;
    }

    case 'go': {
      sendRunStatus('Running with go...');
      result = await runCommand('go', ['run', filePath], { cwd: dir });
      break;
    }

    case 'rust': {
      const outFile = path.join(dir, `${base}${exeSuffix}`);
      sendRunStatus('Compiling with rustc...');
      const compile = await runCommand('rustc', [filePath, '-o', outFile], { cwd: dir });
      if (!compile.success) {
        result = compile;
        break;
      }
      sendRunStatus('Running...');
      result = await runCommand(outFile, [], { cwd: dir });
      break;
    }

    default: {
      sendRunOutput('stderr', `Running "${language}" files is not supported.\n`);
      return { success: false };
    }
  }

  return result;
});

ipcMain.handle('stop-run', () => {
  killRunningProcess();
  return { success: true };
});