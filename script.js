// script.js — wires together theme, languages, editor, and the Judge0 API;
// owns localStorage persistence, panel resizing, and the run/output flow.

import { getLanguage, isSupportedLanguage, LANGUAGES } from "./languages.js";
import {
  initEditor,
  getEditor,
  getEditorValue,
  setEditorValue,
  setEditorLanguage,
  setEditorEnabled,
  focusEditor,
} from "./editor.js";
import { runCode, Judge0Error } from "./api.js";

const STORAGE_KEYS = {
  language: "codefusion:language",
  code: "codefusion:code:", // + language key
  input: "codefusion:stdin",
};

// ---- DOM references ---------------------------------------------------
const languageSelect = document.getElementById("languageSelect");
const runBtn = document.getElementById("runBtn");
const statusBadge = document.getElementById("statusBadge");
const fileName = document.getElementById("fileName");
const stdinInput = document.getElementById("stdinInput");
const outputConsole = document.getElementById("outputConsole");
const outputMeta = document.getElementById("outputMeta");
const panelDivider = document.getElementById("panelDivider");
const ioDivider = document.getElementById("ioDivider");
const workspace = document.querySelector(".workspace");
const ioPanel = document.querySelector(".panel--io");
const dialogOverlay = document.getElementById("confirmDialog");
const dialogCancel = document.getElementById("dialogCancel");
const dialogConfirm = document.getElementById("dialogConfirm");

// ---- State --------------------------------------------------------------
let currentLangKey = loadLanguagePreference();
let isRunning = false;
let pendingLangSwitch = null; // language key awaiting confirmation

// ==========================================================================
// Persistence helpers
// ==========================================================================

function loadLanguagePreference() {
  const saved = localStorage.getItem(STORAGE_KEYS.language);
  return isSupportedLanguage(saved) ? saved : "c";
}

function codeStorageKey(langKey) {
  return STORAGE_KEYS.code + langKey;
}

function loadSavedCode(langKey) {
  return localStorage.getItem(codeStorageKey(langKey));
}

function saveCode(langKey, code) {
  localStorage.setItem(codeStorageKey(langKey), code);
}

function saveLanguagePreference(langKey) {
  localStorage.setItem(STORAGE_KEYS.language, langKey);
}

function loadSavedInput() {
  return localStorage.getItem(STORAGE_KEYS.input) || "";
}

function saveInput(value) {
  localStorage.setItem(STORAGE_KEYS.input, value);
}

// ==========================================================================
// Init
// ==========================================================================

async function bootstrap() {
  languageSelect.value = currentLangKey;
  updateFileName(currentLangKey);

  const langConfig = getLanguage(currentLangKey);
  const startingCode = loadSavedCode(currentLangKey) ?? langConfig.template;

  await initEditor(startingCode, langConfig.monacoId);

  stdinInput.value = loadSavedInput();

  bindLanguageSwitching();
  bindRunButton();
  bindPersistenceListeners();
  bindKeyboardShortcuts();
  bindDividers();
}

function updateFileName(langKey) {
  fileName.textContent = getLanguage(langKey).fileName;
}

// ==========================================================================
// Language switching (with "unsaved changes" confirmation)
// ==========================================================================

function currentCodeDiffersFromTemplate() {
  const template = getLanguage(currentLangKey).template;
  const current = getEditorValue();
  // "Changed" means the live editor content no longer matches the pristine
  // template for this language — the user has written something of their own.
  return current !== template;
}

function bindLanguageSwitching() {
  languageSelect.addEventListener("change", (e) => {
    const nextLangKey = e.target.value;

    if (nextLangKey === currentLangKey) return;

    switchLanguage(nextLangKey);
  });
}

function switchLanguage(nextLangKey) {
  // Persist whatever is currently in the editor before leaving this language.
  saveCode(currentLangKey, getEditorValue());

  currentLangKey = nextLangKey;
  languageSelect.value = nextLangKey;
  saveLanguagePreference(nextLangKey);
  updateFileName(nextLangKey);

  const langConfig = getLanguage(nextLangKey);
  const codeToLoad = loadSavedCode(nextLangKey) ?? langConfig.template;

  setEditorValue(codeToLoad);
  setEditorLanguage(langConfig.monacoId);
  resetStatus();
  focusEditor();
}

// function bindDialog() {
//   dialogCancel.addEventListener("click", closeDialog);
//   dialogConfirm.addEventListener("click", () => {
//     const target = pendingLangSwitch;
//     closeDialog();
//     if (target) switchLanguage(target);
//   });
//   dialogOverlay.addEventListener("click", (e) => {
//     if (e.target === dialogOverlay) closeDialog();
//   });
// }

// function openDialog() {
//   dialogOverlay.hidden = false;
//   dialogConfirm.focus();
// }

// function closeDialog() {
//   dialogOverlay.hidden = true;
//   pendingLangSwitch = null;
// }

// ==========================================================================
// Persistence listeners (code + stdin autosave)
// ==========================================================================

function bindPersistenceListeners() {
  // Debounced autosave of editor content.
  let saveTimer = null;
  const editor = getEditor();
  editor.onDidChangeModelContent(() => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveCode(currentLangKey, getEditorValue());
    }, 400);
  });

  stdinInput.addEventListener("input", () => {
    saveInput(stdinInput.value);
  });
}

// ==========================================================================
// Run flow
// ==========================================================================

function bindRunButton() {
  runBtn.addEventListener("click", handleRun);
}

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const isRunShortcut = (e.ctrlKey || e.metaKey) && e.key === "Enter";
    if (isRunShortcut) {
      e.preventDefault();
      handleRun();
    }
  });
}

async function handleRun() {
  if (isRunning) return; // prevent overlapping requests

  const code = getEditorValue();
  const langConfig = getLanguage(currentLangKey);

  setRunningState(true);
  setStatus("running", "Compiling…");
  renderOutput([{ type: "meta", text: `Running ${langConfig.label}…` }]);

  try {
    const result = await runCode({
      sourceCode: code,
      languageId: langConfig.judge0Id,
      stdin: stdinInput.value,
    });

    presentResult(result);
  } catch (err) {
    const message =
      err instanceof Judge0Error ? err.message : "Something went wrong while running your code. Please try again.";
    setStatus("error", "Error");
    renderOutput([{ type: "error", text: message }]);
  } finally {
    setRunningState(false);
  }
}

function setRunningState(running) {
  isRunning = running;
  runBtn.disabled = running;
  runBtn.setAttribute("data-running", String(running));
  setEditorEnabled(!running);
}

/**
 * Judge0 status IDs of interest:
 * 3 = Accepted, 4 = Wrong Answer (unused here, no expected output),
 * 5 = Time Limit Exceeded, 6 = Compilation Error,
 * 7-12 = various Runtime Errors, 13 = Internal Error, 14 = Exec Format Error
 */
function presentResult(result) {
  const { status, stdout, stderr, compileOutput, message, time, memory } = result;
  const statusId = status.id;
  const lines = [];

  if (statusId === 6) {
    setStatus("error", "Compilation error");
    lines.push({ type: "error", text: "Compilation error:" });
    lines.push({ type: "error", text: compileOutput || status.description });
  } else if (statusId === 5) {
    setStatus("warning", "Time limit exceeded");
    lines.push({ type: "warning", text: "Time limit exceeded." });
    if (stdout) lines.push({ type: "stdout", text: stdout });
  } else if (statusId >= 7 && statusId <= 12) {
    setStatus("error", "Runtime error");
    lines.push({ type: "error", text: `Runtime error: ${status.description}` });
    if (stderr) lines.push({ type: "error", text: stderr });
    if (stdout) lines.push({ type: "stdout", text: stdout });
  } else if (statusId === 13) {
    setStatus("error", "Internal error");
    lines.push({ type: "error", text: "The compiler service hit an internal error. Please try again." });
  } else if (statusId === 14) {
    setStatus("error", "Execution format error");
    lines.push({ type: "error", text: message || "The submission couldn't be executed." });
  } else if (statusId === 3) {
    setStatus("success", "Success");
    lines.push({ type: "stdout", text: stdout || "(Program produced no output.)" });
    if (stderr) lines.push({ type: "warning", text: stderr });
  } else {
    setStatus("warning", status.description || "Unknown");
    lines.push({ type: "meta", text: status.description || "Unknown status returned by the compiler service." });
    if (stdout) lines.push({ type: "stdout", text: stdout });
    if (stderr) lines.push({ type: "error", text: stderr });
  }

  renderOutput(lines);
  renderMeta({ time, memory, statusId });
}

function renderMeta({ time, memory, statusId }) {
  outputMeta.innerHTML = "";
  if (statusId === 0) return;
  const parts = [];
  if (time) parts.push(`${time}s`);
  if (memory) parts.push(`${(memory / 1024).toFixed(1)} MB`);
  outputMeta.textContent = parts.join(" · ");
}

function renderOutput(lines) {
  outputConsole.innerHTML = "";
  if (!lines.length) {
    const placeholder = document.createElement("span");
    placeholder.className = "output-console__placeholder";
    placeholder.textContent = "Run your code to see output here.";
    outputConsole.appendChild(placeholder);
    return;
  }

  const typeClassMap = {
    stdout: "out-stdout",
    error: "out-error",
    warning: "out-warning",
    meta: "out-meta",
    success: "out-success",
  };

  lines.forEach(({ type, text }) => {
    const el = document.createElement("div");
    el.className = `out-line ${typeClassMap[type] || "out-stdout"}`;
    el.textContent = text;
    outputConsole.appendChild(el);
  });

  outputConsole.scrollTop = outputConsole.scrollHeight;
}

function setStatus(state, label) {
  statusBadge.dataset.state = state;
  statusBadge.textContent = label;
}

function resetStatus() {
  setStatus("idle", "Ready");
  outputMeta.textContent = "";
  renderOutput([]);
}

// ==========================================================================
// Resizable panels (editor <-> I/O, and input <-> output)
// ==========================================================================

function bindDividers() {
  bindDragHandle(panelDivider, {
    axis: "x",
    onDrag: (deltaX) => {
      const editorPanel = document.querySelector(".panel--editor");
      const total = workspace.clientWidth;
      const currentWidth = editorPanel.getBoundingClientRect().width;
      const newWidth = Math.min(Math.max(currentWidth + deltaX, total * 0.25), total * 0.78);
      editorPanel.style.flex = `0 0 ${newWidth}px`;
    },
  });

  bindDragHandle(ioDivider, {
    axis: "y",
    onDrag: (deltaY) => {
      const inputBlock = document.querySelector(".io-block--input");
      const total = ioPanel.getBoundingClientRect().height;
      const currentHeight = inputBlock.getBoundingClientRect().height;
      const newHeight = Math.min(Math.max(currentHeight + deltaY, total * 0.15), total * 0.75);
      inputBlock.style.flex = `0 0 ${newHeight}px`;
    },
  });
}

function bindDragHandle(handle, { axis, onDrag }) {
  let dragging = false;
  let lastPos = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    lastPos = axis === "x" ? e.clientX : e.clientY;
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const pos = axis === "x" ? e.clientX : e.clientY;
    const delta = pos - lastPos;
    lastPos = pos;
    onDrag(delta);
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.userSelect = "";
  });

  // Basic keyboard support for accessibility.
  handle.addEventListener("keydown", (e) => {
    const step = 16;
    if (axis === "x" && e.key === "ArrowLeft") onDrag(-step);
    else if (axis === "x" && e.key === "ArrowRight") onDrag(step);
    else if (axis === "y" && e.key === "ArrowUp") onDrag(-step);
    else if (axis === "y" && e.key === "ArrowDown") onDrag(step);
  });
}

// ==========================================================================
// Go
// ==========================================================================

bootstrap();