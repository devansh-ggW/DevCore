/* global monaco, require, COMMANDS, CURSOR_MARKER, getLanguageForFile,
   getCommandsForLanguage, LANGUAGE_TO_MONACO_ID, LANGUAGE_DISPLAY_NAME */

let editor = null;
let currentFilePath = null;
let currentLanguage = 'plaintext';

// Slash-command popup state
let popupOpen = false;
let popupMatches = [];      // array of { name, template }
let popupSelectedIndex = 0;
let slashStartPosition = null; // { lineNumber, column } - position right after "/"

const popupEl = document.getElementById('slash-popup') || document.createElement('div');
popupEl.id = 'slash-popup';
if (!popupEl.parentElement) { popupEl.className = 'slash-popup hidden'; document.body.appendChild(popupEl); }
const filenameEl = document.getElementById('filename');
const tabNameEl = document.getElementById('tab-name');
const crumbFileEl = document.getElementById('crumb-file');
const statusLanguageEl = document.getElementById('status-language');
const statusPositionEl = document.getElementById('status-position');
const treeFileNameEl = document.getElementById('tree-file-name');
const problemCountEl = document.getElementById('problem-count');
const editorContainer = document.getElementById('editor-container');
const editorEmptyEl = document.getElementById('editor-empty');
const terminalOutputEl = document.getElementById('terminal-output');
const btnRun = document.getElementById('btn-run');
const btnStop = document.getElementById('btn-stop');

// Languages the Run feature knows how to execute.
const RUNNABLE_LANGUAGES = new Set([
  'python', 'javascript', 'typescript', 'c', 'cpp', 'java', 'csharp', 'go', 'rust'
]);

let isRunning = false;
let syntaxCheckTimer = null;
let syntaxCheckRequest = 0;

// ---------- Monaco bootstrap ----------

require.config({ paths: { vs: 'node_modules/monaco-editor/min/vs' } });

require(['vs/editor/editor.main'], function () {
  monaco.editor.defineTheme('devcore-ink', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // DevCore syntax palette — inspired by VS Code Dark+.
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'CBA6F7' },
      { token: 'keyword.control', foreground: 'CBA6F7' },
      { token: 'string', foreground: 'A6E3A1' },
      { token: 'string.escape', foreground: 'F9E2AF' },
      { token: 'number', foreground: 'FAB387' },
      { token: 'type', foreground: '89DCEB' },
      { token: 'type.identifier', foreground: '89DCEB' },
      { token: 'function', foreground: 'F9E2AF' },
      { token: 'function.call', foreground: 'F9E2AF' },
      { token: 'variable', foreground: 'CDD6F4' },
      { token: 'variable.predefined', foreground: '89DCEB' },
      { token: 'constant', foreground: '89DCEB' },
      { token: 'delimiter', foreground: 'BAC2DE' },
      { token: 'operator', foreground: 'CDD6F4' },
      { token: 'tag', foreground: 'CBA6F7' },
      { token: 'attribute.name', foreground: '89DCEB' },
      { token: 'annotation', foreground: 'F9E2AF' }
    ],
    colors: {
      'editor.background': '#1E1E2E',
      'editor.foreground': '#CDD6F4',
      'editorLineNumber.foreground': '#585B70',
      'editorLineNumber.activeForeground': '#A6ADC8',
      'editorCursor.foreground': '#CBA6F7',
      'editor.lineHighlightBackground': '#24243A',
      'editor.selectionBackground': '#45475A',
      'editor.inactiveSelectionBackground': '#313244',
      'editor.selectionHighlightBackground': '#313244',
      'editor.wordHighlightBackground': '#45475A',
      'editor.findMatchBackground': '#5B4B7A',
      'editor.findMatchHighlightBackground': '#3F3A55',
      'editorIndentGuide.background1': '#313244',
      'editorIndentGuide.activeBackground1': '#45475A',
      'editorBracketMatch.background': '#313244',
      'editorBracketMatch.border': '#CBA6F7',
      'editorWidget.background': '#24273A',
      'editorWidget.border': '#45475A',
      'editorSuggestWidget.background': '#24273A',
      'editorSuggestWidget.border': '#45475A',
      'editorSuggestWidget.selectedBackground': '#313244',
      'editorHoverWidget.background': '#24273A',
      'editorHoverWidget.border': '#45475A'
    }
  });

  editor = monaco.editor.create(editorContainer, {
    value: '',
    language: 'plaintext',
    theme: 'devcore-ink',
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: 'Consolas, "Cascadia Code", monospace',
    fontSize: 14,
    lineHeight: 21,
    cursorBlinking: 'smooth',
    smoothScrolling: true,
    renderLineHighlight: 'line',
    padding: { top: 8 },
    // Code-editor conveniences: bracket/quote pairing and quick fixes.
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    suggestOnTriggerCharacters: true,
    quickSuggestions: true

  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveFile);

  editor.onDidChangeCursorPosition(() => {
    updateStatusPosition();
    updateSlashState();
  });

  editor.onDidChangeModelContent(() => {
    updateSlashState();
    updateEmptyState();
    scheduleSyntaxCheck();
  });

  editor.onKeyDown((e) => {
    if (!popupOpen) return;

    if (e.keyCode === monaco.KeyCode.DownArrow) {
      e.preventDefault();
      moveSelection(1);
    } else if (e.keyCode === monaco.KeyCode.UpArrow) {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.keyCode === monaco.KeyCode.Enter || e.keyCode === monaco.KeyCode.Tab) {
      e.preventDefault();
      executeSelectedCommand();
    } else if (e.keyCode === monaco.KeyCode.Escape) {
      e.preventDefault();
      closePopup();
    }
  });

  registerQuickFixes();
  setLanguage('plaintext');
  updateEmptyState();
});

function updateEmptyState() {
  if (!editor || !editorEmptyEl) return;
  editorEmptyEl.classList.toggle('hidden', editor.getValue().length > 0);
}

// ---------- Slash command detection ----------

function updateSlashState() {
  if (!editor) return;

  const position = editor.getPosition();
  const lineContent = editor.getModel().getLineContent(position.lineNumber);
  const textBeforeCursor = lineContent.slice(0, position.column - 1);

  // Find the start of a "/word" token ending at the cursor: the slash must be
  // at the start of the line or preceded by whitespace, and everything between
  // the slash and the cursor must be word characters (no spaces).
  const match = /(^|\s)\/([A-Za-z]*)$/.exec(textBeforeCursor);

  if (!match) {
    closePopup();
    return;
  }

  const query = match[2].toLowerCase();
  const slashColumn = position.column - query.length - 1; // column of "/" itself

  const commandsForLang = getCommandsForLanguage(currentLanguage);
  const names = Object.keys(commandsForLang).filter((name) => name.startsWith(query));

  if (names.length === 0) {
    closePopup();
    return;
  }

  slashStartPosition = { lineNumber: position.lineNumber, column: slashColumn };
  popupMatches = names.map((name) => ({ name, template: commandsForLang[name] }));
  popupSelectedIndex = 0;
  openPopup(position);
}

// ---------- Popup rendering ----------

function openPopup(cursorPosition) {
  popupOpen = true;
  renderPopup();

  const visiblePos = editor.getScrolledVisiblePosition(cursorPosition);
  if (visiblePos) {
    const containerRect = editorContainer.getBoundingClientRect();
    popupEl.style.left = containerRect.left + visiblePos.left + 'px';
    popupEl.style.top = containerRect.top + visiblePos.top + visiblePos.height + 'px';
  }

  popupEl.classList.remove('hidden');
}

function renderPopup() {
  popupEl.innerHTML = '';
  popupMatches.forEach((match, index) => {
    const item = document.createElement('div');
    item.className = 'popup-item' + (index === popupSelectedIndex ? ' selected' : '');
    item.textContent = '/' + match.name;
    item.addEventListener('mousedown', (e) => {
      // mousedown (not click) so it fires before the editor steals focus/blurs the popup
      e.preventDefault();
      popupSelectedIndex = index;
      executeSelectedCommand();
    });
    popupEl.appendChild(item);
  });
}

function moveSelection(delta) {
  popupSelectedIndex = (popupSelectedIndex + delta + popupMatches.length) % popupMatches.length;
  renderPopup();
}

function closePopup() {
  popupOpen = false;
  popupMatches = [];
  slashStartPosition = null;
  popupEl.classList.add('hidden');
  popupEl.innerHTML = '';
}

// ---------- Command execution / smart insertion ----------

function executeSelectedCommand() {
  const match = popupMatches[popupSelectedIndex];
  if (!match || !slashStartPosition) {
    closePopup();
    return;
  }

  const position = editor.getPosition();
  const model = editor.getModel();

  // Indentation of the line the slash command was typed on.
  const lineContent = model.getLineContent(slashStartPosition.lineNumber);
  const indentMatch = /^[ \t]*/.exec(lineContent);
  const indent = indentMatch ? indentMatch[0] : '';

  // Apply the line's indentation to every line after the first in the template.
  const templateLines = match.template.split('\n');
  const indentedTemplate = templateLines
    .map((line, idx) => (idx === 0 ? line : indent + line))
    .join('\n');

  const markerIndex = indentedTemplate.indexOf(CURSOR_MARKER);
  const textBeforeMarker = markerIndex >= 0 ? indentedTemplate.slice(0, markerIndex) : indentedTemplate;
  const textAfterMarker = markerIndex >= 0 ? indentedTemplate.slice(markerIndex + CURSOR_MARKER.length) : '';
  const finalText = textBeforeMarker + textAfterMarker;

  // Range covering the "/query" text that should be replaced.
  const range = new monaco.Range(
    slashStartPosition.lineNumber,
    slashStartPosition.column,
    position.lineNumber,
    position.column
  );

  editor.executeEdits('devcore-slash-command', [
    { range, text: finalText, forceMoveMarkers: true }
  ]);

  // Compute where the cursor should end up: the position immediately after
  // textBeforeMarker, starting from where we inserted.
  const cursorPos = advancePosition(slashStartPosition.lineNumber, slashStartPosition.column, textBeforeMarker);
  editor.setPosition(cursorPos);
  editor.focus();

  closePopup();
}

// Given a starting line/column and a block of inserted text, compute the
// resulting line/column after the text.
function advancePosition(startLine, startColumn, text) {
  const lines = text.split('\n');
  if (lines.length === 1) {
    return { lineNumber: startLine, column: startColumn + lines[0].length };
  }
  return {
    lineNumber: startLine + lines.length - 1,
    column: lines[lines.length - 1].length + 1
  };
}

// ---------- Live diagnostics + safe auto-fixes ----------

function applyDiagnostics(diagnostics) {
  if (!editor || !editor.getModel()) return;
  const model = editor.getModel();

  const markers = (diagnostics || []).map(d => ({
    severity: d.severity === 'warning'
      ? monaco.MarkerSeverity.Warning
      : monaco.MarkerSeverity.Error,
    message: d.message,
    startLineNumber: Math.max(1, d.line || 1),
    startColumn: Math.max(1, d.column || 1),
    endLineNumber: Math.max(1, d.line || 1),
    endColumn: Math.max((d.column || 1) + 1, d.endColumn || 1),
    source: 'DevCore Syntax Engine'
  }));

  monaco.editor.setModelMarkers(model, 'devcore-syntax', markers);
  const count = markers.length;
  if (problemCountEl) problemCountEl.textContent = String(count);
}

function scheduleSyntaxCheck() {
  if (!editor) return;

  clearTimeout(syntaxCheckTimer);
  const requestId = ++syntaxCheckRequest;

  syntaxCheckTimer = setTimeout(async () => {
    const content = editor.getValue();
    const languageAtRequest = currentLanguage;

    // Monaco already supplies rich diagnostics for JS/TS in supported setups.
    // The main-process checker adds reliable runtime-parser checks for Python,
    // JavaScript and JSON without requiring an AI API key.
    if (!window.devcore?.checkSyntax) return;

    const result = await window.devcore.checkSyntax(content, languageAtRequest);
    if (requestId !== syntaxCheckRequest || languageAtRequest !== currentLanguage) return;

    applyDiagnostics(result?.diagnostics || []);
    offerSafeAutoFix();
  }, 350);
}

function offerSafeAutoFix() {
  if (!editor || currentLanguage !== 'python') return;

  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return;

  // Only auto-fix an extremely unambiguous Python mistake on the line being edited:
  // control/declaration statements that end in a condition/header but lack ':'.
  // We deliberately do NOT rewrite arbitrary code.
  const line = model.getLineContent(position.lineNumber);
  const trimmed = line.trim();

  const pythonHeader = /^(if|elif|else|for|while|def|class|try|except|finally|with)\b.*[^:;]$/;
  if (!pythonHeader.test(trimmed)) return;

  // Don't touch comments, strings, or lines that already have a block delimiter.
  if (trimmed.startsWith('#') || /["'].*["']/.test(trimmed) && /^(print|return|[A-Za-z_]\w*\s*=)/.test(trimmed)) return;

  const lineEnd = model.getLineMaxColumn(position.lineNumber);
  const fullRange = new monaco.Range(position.lineNumber, 1, position.lineNumber, lineEnd);
  const corrected = line.replace(/\s*$/, '') + ':';

  // This is only a safe, syntactically deterministic correction.
  if (corrected !== line) {
    editor.executeEdits('devcore-safe-autofix', [{
      range: fullRange,
      text: corrected,
      forceMoveMarkers: true
    }]);
  }
}

function registerQuickFixes() {
  if (!monaco.languages?.registerCodeActionProvider) return;

  monaco.languages.registerCodeActionProvider(
    ['python', 'javascript', 'typescript', 'json'],
    {
      provideCodeActions(model, range) {
        const actions = [];
        const line = model.getLineContent(range.startLineNumber);

        // Python: missing ':' on a block header.
        if (currentLanguage === 'python') {
          const trimmed = line.trim();
          const header = /^(if|elif|else|for|while|def|class|try|except|finally|with)\b.*[^:;]$/.test(trimmed);
          if (header) {
            actions.push({
              title: "Add ':'",
              kind: 'quickfix',
              edit: {
                edits: [{
                  resource: model.uri,
                  textEdit: {
                    range: new monaco.Range(
                      range.startLineNumber, 1,
                      range.startLineNumber, model.getLineMaxColumn(range.startLineNumber)
                    ),
                    text: line.replace(/\s*$/, '') + ':'
                  }
                }]
              }
            });
          }
        }

        return { actions, dispose() {} };
      }
    }
  );
}

// ---------- Language handling ----------

function setLanguage(language) {
  currentLanguage = language;
  const monacoId = LANGUAGE_TO_MONACO_ID[language] || 'plaintext';
  if (editor) {
    monaco.editor.setModelLanguage(editor.getModel(), monacoId);
    monaco.editor.setModelMarkers(editor.getModel(), 'devcore-syntax', []);
  }
  statusLanguageEl.textContent = LANGUAGE_DISPLAY_NAME[language] || 'Plain Text';
  scheduleSyntaxCheck();
}

function updateStatusPosition() {
  const position = editor.getPosition();
  statusPositionEl.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
}

// ---------- Workspace + file operations ----------

let workspaceRoot = null;
let workspaceEntries = [];
const openTabs = new Map();

function activeFileName() {
  return currentFilePath ? currentFilePath.split(/[/\\]/).pop() : 'untitled';
}

function updateFileChrome() {
  const name = activeFileName();
  if (filenameEl) filenameEl.textContent = name;
  if (tabNameEl) tabNameEl.textContent = name;
  if (crumbFileEl) crumbFileEl.textContent = name;
  if (statusWorkspaceEl) statusWorkspaceEl.textContent = workspaceRoot ? workspaceRoot : 'No workspace';
}

function iconForFile(name) {
  const ext = name.toLowerCase().split('.').pop();
  const icons = { js:'JS',ts:'TS',py:'PY',html:'<>',css:'#',json:'{}',md:'M',java:'J',cpp:'C+',c:'C',rs:'RS',go:'GO',php:'PHP' };
  return icons[ext] || '·';
}

async function openFile() {
  const result = await window.devcore.openFile();
  if (!result?.success) return;
  if (!workspaceRoot) workspaceRoot = result.filePath.replace(/[/\\][^/\\]+$/, '');
  await loadFile(result.filePath, result.content);
  await refreshTree();
  startTerminal();
}

async function loadFile(filePath, content) {
  currentFilePath = filePath;
  const existing = openTabs.get(filePath);
  if (existing && editor) editor.setModel(existing);
  else if (editor) {
    editor.setValue(content ?? '');
    openTabs.set(filePath, editor.getModel());
  }
  setLanguage(getLanguageForFile(filePath));
  updateFileChrome();
  updateTabs();
  updateStatusPosition();
  updateEmptyState();
  highlightTreePath(filePath);
  editor?.focus();
}

function updateTabs() {
  const tabs = document.getElementById('editor-tabs');
  if (!tabs) return;
  tabs.textContent = '';
  for (const [filePath] of openTabs) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (filePath === currentFilePath ? ' active' : '');
    tab.innerHTML = `<span class="file-dot"></span><span class="tab-name"></span><span class="tab-close" title="Close tab">×</span>`;
    tab.querySelector('.tab-name').textContent = filePath.split(/[/\\]/).pop();
    tab.querySelector('.tab-name').onclick = () => switchTab(filePath);
    tab.querySelector('.tab-close').onclick = (e) => { e.stopPropagation(); closeTab(filePath); };
    tab.onclick = () => switchTab(filePath);
    tabs.appendChild(tab);
  }
}

function switchTab(filePath) {
  const model = openTabs.get(filePath);
  if (!model || !editor) return;
  currentFilePath = filePath;
  editor.setModel(model);
  setLanguage(getLanguageForFile(filePath));
  updateFileChrome();
  updateTabs();
  updateStatusPosition();
  highlightTreePath(filePath);
  editor.focus();
}

function closeTab(filePath) {
  const model = openTabs.get(filePath);
  if (model) model.dispose();
  openTabs.delete(filePath);
  if (currentFilePath === filePath) {
    const next = [...openTabs.keys()].pop();
    if (next) switchTab(next);
    else {
      currentFilePath = null;
      editor?.setValue('');
      updateFileChrome();
      updateTabs();
      updateEmptyState();
    }
  } else updateTabs();
}

async function saveFile() {
  if (!editor) return;
  const content = editor.getValue();
  if (currentFilePath) {
    const result = await window.devcore.saveFile(currentFilePath, content);
    if (!result.success) alert('Failed to save: ' + result.error);
    else {
      appendTerminal(`Saved ${activeFileName()}\n`, 'terminal-line-exit-ok');
      refreshTree();
    }
    return;
  }
  const result = await window.devcore.saveFileAs(content);
  if (result.success) {
    currentFilePath = result.filePath;
    if (editor.getModel()) openTabs.set(currentFilePath, editor.getModel());
    workspaceRoot ||= result.filePath.replace(/[/\\][^/\\]+$/, '');
    setLanguage(getLanguageForFile(currentFilePath));
    updateFileChrome(); updateTabs(); refreshTree(); startTerminal();
  }
}

async function openWorkspace() {
  const result = await window.devcore.openFolder();
  if (!result?.success) return;
  workspaceRoot = result.path;
  statusWorkspaceEl.textContent = workspaceRoot;
  document.getElementById('workspace-label').textContent = result.name.toUpperCase();
  await refreshTree();
  startTerminal();
  if (!currentFilePath) appendTerminal(`Workspace opened: ${workspaceRoot}\n`, 'terminal-line-status');
}

async function refreshTree() {
  const tree = document.getElementById('file-tree');
  if (!tree || !workspaceRoot) return;
  tree.textContent = '';
  const result = await window.devcore.listDirectory(workspaceRoot);
  if (!result?.success) {
    tree.textContent = result.error || 'Unable to read workspace';
    return;
  }
  workspaceEntries = result.entries;
  for (const entry of result.entries) {
    const row = makeTreeRow(entry, workspaceRoot);
    tree.appendChild(row);
  }
}

function makeTreeRow(entry, parent) {
  const row = document.createElement('div');
  row.className = 'tree-item ' + (entry.type === 'directory' ? 'tree-dir' : '');
  row.title = entry.name;
  row.innerHTML = `<span class="tree-chevron">${entry.type === 'directory' ? '›' : ''}</span><span class="tree-icon">${entry.type === 'directory' ? '▰' : iconForFile(entry.name)}</span><span class="tree-name"></span>`;
  row.querySelector('.tree-name').textContent = entry.name;
  const target = parent + pathSep() + entry.name;
  if (entry.type === 'directory') {
    row.querySelector('.tree-chevron').textContent = '›';
    row.addEventListener('dblclick', () => toggleDirectory(row, target));
  } else {
    row.addEventListener('click', async () => {
      const result = await window.devcore.openFileAt?.(target);
      if (result) await loadFile(target, result.content);
      else {
        try {
          const content = await window.devcore.readFile?.(target);
          if (content) await loadFile(target, content);
        } catch (_) {}
      }
      // open-file dialog fallback is avoided by using the direct main-process path handler below
      if (window.devcore.readFile) {
        const direct = await window.devcore.readFile(target);
        if (direct?.success) await loadFile(target, direct.content);
      }
    });
    row.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      if (confirm(`Delete "${entry.name}"?`)) {
        const r = await window.devcore.deletePath(target);
        if (!r.success) alert(r.error);
        else { if (currentFilePath === target) closeTab(target); refreshTree(); }
      }
    });
  }
  return row;
}

async function toggleDirectory(row, dirPath) {
  const existing = row.nextElementSibling;
  if (existing?.classList.contains('tree-children') && existing.dataset.parent === dirPath) {
    existing.remove();
    row.querySelector('.tree-chevron').textContent = '›';
    return;
  }
  const result = await window.devcore.listDirectory(dirPath);
  if (!result?.success) return;
  const wrap = document.createElement('div');
  wrap.className = 'tree-children'; wrap.dataset.parent = dirPath;
  for (const entry of result.entries) wrap.appendChild(makeTreeRow(entry, dirPath));
  row.after(wrap);
  row.querySelector('.tree-chevron').textContent = '⌄';
}

function pathSep() { return navigator.userAgent.includes('Windows') ? '\\' : '/'; }

function highlightTreePath(filePath) {
  document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
  const name = filePath?.split(/[/\\]/).pop();
  document.querySelectorAll('.tree-name').forEach(el => {
    if (el.textContent === name) el.parentElement.classList.add('active');
  });
}

async function newFile() {
  if (!workspaceRoot) {
    await openWorkspace();
    if (!workspaceRoot) return;
  }
  const name = prompt('New file name:', 'main.py');
  if (!name) return;
  const result = await window.devcore.createFile(workspaceRoot, name.trim());
  if (!result.success) { alert(result.error); return; }
  await refreshTree();
  const direct = await window.devcore.readFile(result.path);
  if (direct?.success) await loadFile(result.path, direct.content);
}

async function newFolder() {
  if (!workspaceRoot) { await openWorkspace(); if (!workspaceRoot) return; }
  const name = prompt('New folder name:', 'src');
  if (!name) return;
  const result = await window.devcore.createFolder(workspaceRoot, name.trim());
  if (!result.success) alert(result.error);
  else refreshTree();
}

function startTerminal() {
  if (!window.devcore?.terminalStart) return;
  window.devcore.terminalStart(workspaceRoot || null).then(result => {
    if (result?.cwd) { updateTerminalPrompt(); }
  });
}

function appendTerminal(text, className) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  terminalOutputEl.appendChild(span);
  terminalOutputEl.scrollTop = terminalOutputEl.scrollHeight;
}

function terminalPrompt() {
  return 'MR. DEVELOPER>';
}

function updateTerminalPrompt() {
  const prompt = document.getElementById('terminal-prompt');
  if (prompt) prompt.textContent = terminalPrompt();
}

function clearTerminal() { terminalOutputEl.textContent = ''; }

function setRunningState(running) {
  isRunning = running; btnRun.disabled = running; btnStop.disabled = !running;
}

window.devcore.onTerminalOutput(({ data }) => appendTerminal(data));
window.devcore.onRunOutput(({ stream, data }) => appendTerminal(data, stream === 'stderr' ? 'terminal-line-stderr' : undefined));
window.devcore.onRunStatus(({ message }) => appendTerminal(`\n[${message}]\n`, 'terminal-line-status'));

async function runCode() {
  if (isRunning || !editor) return;
  if (currentFilePath) {
    const result = await window.devcore.saveFile(currentFilePath, editor.getValue());
    if (!result.success) { appendTerminal(`Save failed: ${result.error}\n`, 'terminal-line-stderr'); return; }
  } else {
    await saveFile();
    if (!currentFilePath) return;
  }
  if (!RUNNABLE_LANGUAGES.has(currentLanguage)) {
    appendTerminal(`Running ${LANGUAGE_DISPLAY_NAME[currentLanguage] || currentLanguage} is not supported.\n`, 'terminal-line-stderr');
    return;
  }
  appendTerminal(`\n▶ Running ${currentFilePath}\n`, 'terminal-line-status');
  setRunningState(true);
  try {
    const result = await window.devcore.runCode(currentFilePath, currentLanguage);
    if (result && typeof result.code === 'number') appendTerminal(`\nProcess exited with code ${result.code}\n`, result.code === 0 ? 'terminal-line-exit-ok' : 'terminal-line-exit-fail');
  } finally { setRunningState(false); }
}

async function stopRun() { if (isRunning) await window.devcore.stopRun(); }

function updateFocusButtons() {
  const workspace = document.body.classList.contains('workspace-focus');
  const terminal = document.body.classList.contains('terminal-focus');
  const w = document.getElementById('btn-workspace-fullscreen');
  const e = document.getElementById('btn-editor-fullscreen');
  const t = document.getElementById('btn-terminal-fullscreen');
  if (w) { w.textContent = workspace ? '⛶' : '⛶'; w.title = workspace ? 'Exit workspace focus' : 'Focus workspace'; }
  if (e) { e.textContent = '⛶'; e.title = workspace ? 'Exit editor focus' : 'Focus editor'; }
  if (t) { t.textContent = '⛶'; t.title = terminal ? 'Exit terminal focus' : 'Maximize terminal'; }
}

function focusWorkspace() {
  const next = !document.body.classList.contains('workspace-focus');
  document.body.classList.remove('terminal-focus');
  document.body.classList.toggle('workspace-focus', next);
  updateFocusButtons();
  requestAnimationFrame(() => editor?.layout());
}

function focusTerminal() {
  const next = !document.body.classList.contains('terminal-focus');
  document.body.classList.remove('workspace-focus');
  document.body.classList.toggle('terminal-focus', next);
  updateFocusButtons();
  if (next) terminalInput?.focus();
  else editor?.focus();
  requestAnimationFrame(() => editor?.layout());
}


const paletteCommands = [
  ['Open Folder', openWorkspace, 'Ctrl+Shift+O'],
  ['New File', newFile, 'Ctrl+N'],
  ['Save File', saveFile, 'Ctrl+S'],
  ['Run File', runCode, 'Ctrl+Enter'],
  ['Focus Workspace', focusWorkspace, ''],
  ['Focus Terminal', focusTerminal, ''],
  ['Clear Terminal', clearTerminal, ''],
  ['Refresh Explorer', refreshTree, '']
];

function showPalette() {
  const overlay = document.getElementById('command-palette');
  const input = document.getElementById('palette-input');
  overlay.classList.remove('hidden'); input.value = ''; renderPalette(''); input.focus();
}
function renderPalette(filter) {
  const list = document.getElementById('palette-list'); list.textContent = '';
  paletteCommands.filter(c => c[0].toLowerCase().includes(filter.toLowerCase())).forEach((cmd, i) => {
    const row = document.createElement('div'); row.className = 'palette-item';
    row.innerHTML = `<span></span><span class="palette-key">${cmd[2]}</span>`;
    row.firstChild.textContent = cmd[0]; row.onclick = () => { document.getElementById('command-palette').classList.add('hidden'); cmd[1](); };
    list.appendChild(row);
  });
}

// ---------- Wiring ----------

const statusWorkspaceEl = document.getElementById('status-workspace');
const terminalInput = document.getElementById('terminal-input');
const problemsToggle = document.getElementById('problems-toggle');
const slashPopup = document.getElementById('slash-popup');

// Slash-command popup is optional in older builds; wire the existing engine to it.
if (slashPopup) {
  // The engine expects the popup element through popupEl. Keep the original
  // const immutable while making the feature available in this build.
  // eslint-disable-next-line no-global-assign
  try { Object.defineProperty(window, '__devcoreSlashPopup', { value: slashPopup }); } catch (_) {}
}

// Every static control gets a real action. No decorative controls remain.
document.getElementById('btn-open-folder')?.addEventListener('click', openWorkspace);
document.getElementById('btn-save')?.addEventListener('click', saveFile);
document.getElementById('btn-run')?.addEventListener('click', runCode);
document.getElementById('btn-stop')?.addEventListener('click', stopRun);
document.getElementById('btn-refresh')?.addEventListener('click', refreshTree);
document.getElementById('btn-new-folder')?.addEventListener('click', newFolder);
document.getElementById('btn-collapse')?.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('explorer-collapsed');
  const btn = document.getElementById('btn-collapse');
  if (btn) {
    btn.textContent = collapsed ? '›' : '‹';
    btn.title = collapsed ? 'Show explorer' : 'Collapse explorer';
  }
});
document.getElementById('activity-explorer')?.addEventListener('click', () => {
  document.body.classList.remove('explorer-collapsed');
  document.getElementById('activity-explorer')?.classList.add('active');
});
document.getElementById('activity-save')?.addEventListener('click', saveFile);
document.getElementById('btn-editor-fullscreen')?.addEventListener('click', focusWorkspace);
document.getElementById('btn-workspace-fullscreen')?.addEventListener('click', focusWorkspace);
document.getElementById('btn-terminal-fullscreen')?.addEventListener('click', focusTerminal);
document.getElementById('btn-new-terminal')?.addEventListener('click', startTerminal);
document.getElementById('btn-clear-terminal')?.addEventListener('click', () => {
  clearTerminal();
  terminalInput?.focus();
});
document.getElementById('empty-open-folder')?.addEventListener('click', openWorkspace);
document.getElementById('empty-new-file')?.addEventListener('click', newFile);
document.getElementById('outline-toggle')?.addEventListener('click', (e) => {
  const content = document.querySelector('.section-content');
  const row = e.currentTarget;
  const hidden = content?.classList.toggle('hidden-panel');
  const arrow = row.querySelector('span:last-child');
  if (arrow) arrow.textContent = hidden ? '›' : '⌄';
});
problemsToggle?.addEventListener('click', () => {
  const markers = editor?.getModel() ? monaco.editor.getModelMarkers({ resource: editor.getModel().uri }) : [];
  if (markers.length && editor) {
    const first = markers[0];
    editor.revealLineInCenter(first.startLineNumber);
    editor.setPosition({ lineNumber: first.startLineNumber, column: first.startColumn });
    editor.focus();
  } else {
    editor?.focus();
  }
});
document.getElementById('command-palette')?.addEventListener('click', (e) => {
  if (e.target.id === 'command-palette') e.currentTarget.classList.add('hidden');
});
document.getElementById('btn-command-palette')?.addEventListener('click', showPalette);

// Real Electron window controls.
document.getElementById('btn-window-minimize')?.addEventListener('click', () => window.devcore.minimizeWindow());
document.getElementById('btn-window-maximize')?.addEventListener('click', async () => {
  const state = await window.devcore.toggleMaximize();
  const button = document.getElementById('btn-window-maximize');
  if (button) {
    button.textContent = state?.maximized ? '❐' : '□';
    button.title = state?.maximized ? 'Restore' : 'Maximize';
  }
});
document.getElementById('btn-window-close')?.addEventListener('click', () => window.devcore.closeWindow());
window.devcore.onWindowState?.(({ maximized }) => {
  const button = document.getElementById('btn-window-maximize');
  if (!button) return;
  button.textContent = maximized ? '❐' : '□';
  button.title = maximized ? 'Restore' : 'Maximize';
});

let terminalHistory = [];
let terminalHistoryIndex = -1;
terminalInput.addEventListener('keydown', async e => {
  if (e.key === 'Enter') {
    const value = terminalInput.value;
    terminalInput.value = '';
    if (value.trim()) {
      terminalHistory = [value, ...terminalHistory.filter(x => x !== value)].slice(0, 100);
      // cmd is launched with /Q, so it does not echo typed commands. Render the
      // command ourselves exactly like a normal cmd session, then let the real
      // shell produce the result on the following line.
      appendTerminal(`${terminalPrompt()} ${value}\n`);
    }
    terminalHistoryIndex = -1;
    if (value) await window.devcore.terminalInput(value + '\r\n');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!terminalHistory.length) return;
    terminalHistoryIndex = Math.min(terminalHistoryIndex + 1, terminalHistory.length - 1);
    terminalInput.value = terminalHistory[terminalHistoryIndex];
    terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (terminalHistoryIndex <= 0) {
      terminalHistoryIndex = -1; terminalInput.value = ''; return;
    }
    terminalHistoryIndex--;
    terminalInput.value = terminalHistory[terminalHistoryIndex];
    terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length);
  } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    await window.devcore.terminalInput('\x03');
  }
});
terminalOutputEl.addEventListener('click', () => terminalInput.focus());

document.getElementById('palette-input').addEventListener('input', e => renderPalette(e.target.value));
document.getElementById('palette-input').addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('command-palette').classList.add('hidden');
  if (e.key === 'Enter') document.querySelector('.palette-item')?.click();
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); showPalette(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); newFile(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openWorkspace(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode(); }
  if (e.key === 'Escape') {
    if (document.body.classList.contains('workspace-focus') || document.body.classList.contains('terminal-focus')) {
      document.body.classList.remove('workspace-focus','terminal-focus'); updateFocusButtons(); editor?.layout();
    }
  }
});

// Start a shell immediately so the terminal is useful even before a workspace is opened.
setTimeout(startTerminal, 250);
