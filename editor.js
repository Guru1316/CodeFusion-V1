// editor.js — wraps Monaco Editor setup, theme definitions, and helpers.
// Monaco is loaded lazily via its AMD loader (see index.html) so the initial
// page paints instantly before the editor bundle is fetched.

import { onThemeChange, getTheme } from "./theme.js";

const MONACO_CDN = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs";

let editorInstance = null;
let monacoRef = null;
let readyResolve;
export const editorReady = new Promise((resolve) => (readyResolve = resolve));

function defineThemes(monaco) {
  monaco.editor.defineTheme("codefusion-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5E6672", fontStyle: "italic" },
      { token: "keyword", foreground: "8B6BFF" },
      { token: "string", foreground: "9CDCA0" },
      { token: "number", foreground: "E3B341" },
    ],
    colors: {
      "editor.background": "#161B22",
      "editor.foreground": "#E6EDF3",
      "editorLineNumber.foreground": "#3A4149",
      "editorLineNumber.activeForeground": "#8B949E",
      "editor.selectionBackground": "#4F8CFF33",
      "editor.inactiveSelectionBackground": "#4F8CFF1F",
      "editorCursor.foreground": "#4F8CFF",
      "editor.lineHighlightBackground": "#1C232C",
      "editorGutter.background": "#161B22",
      "editorIndentGuide.background": "#232A33",
      "editorIndentGuide.activeBackground": "#3A4149",
      "editorWidget.background": "#1C232C",
      "editorWidget.border": "#2A3138",
      "editorSuggestWidget.background": "#1C232C",
      "editorSuggestWidget.border": "#2A3138",
      "editorSuggestWidget.selectedBackground": "#4F8CFF22",
    },
  });

  monaco.editor.defineTheme("codefusion-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8A929E", fontStyle: "italic" },
      { token: "keyword", foreground: "7C5CE0" },
      { token: "string", foreground: "1A7F37" },
      { token: "number", foreground: "9A6700" },
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#1F2328",
      "editorLineNumber.foreground": "#C6CBD1",
      "editorLineNumber.activeForeground": "#57606A",
      "editor.selectionBackground": "#3568E026",
      "editorCursor.foreground": "#3568E0",
      "editor.lineHighlightBackground": "#F5F7FA",
      "editorGutter.background": "#FFFFFF",
      "editorIndentGuide.background": "#EDEFF2",
      "editorIndentGuide.activeBackground": "#D6DBE1",
      "editorWidget.background": "#FAFBFC",
      "editorWidget.border": "#E3E6EA",
    },
  });
}

function monacoThemeFor(themeName) {
  return themeName === "dark" ? "codefusion-dark" : "codefusion-light";
}

/**
 * Loads the Monaco AMD bundle and creates the editor instance.
 * @param {string} initialValue
 * @param {string} initialLanguage - Monaco language id
 * @returns {Promise<import('monaco-editor').editor.IStandaloneCodeEditor>}
 */
export function initEditor(initialValue, initialLanguage) {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-undef
    require.config({ paths: { vs: MONACO_CDN } });
    // eslint-disable-next-line no-undef
    require(["vs/editor/editor.main"], () => {
      try {
        // eslint-disable-next-line no-undef
        monacoRef = monaco;
        defineThemes(monacoRef);

        editorInstance = monacoRef.editor.create(document.getElementById("editorContainer"), {
          value: initialValue,
          language: initialLanguage,
          theme: monacoThemeFor(getTheme()),
          fontSize: 16,
          fontFamily: "'JetBrains Mono', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          lineNumbers: "on",
          automaticLayout: true,
          autoIndent: "full",
          matchBrackets: "always",
          bracketPairColorization: { enabled: true },
          folding: true,
          autoClosingBrackets: "always",
          autoClosingQuotes: "always",
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          padding: { top: 14, bottom: 14 },
          tabSize: 4,
          renderLineHighlight: "line",
        });

        onThemeChange((theme) => {
          monacoRef.editor.setTheme(monacoThemeFor(theme));
        });

        readyResolve(editorInstance);
        resolve(editorInstance);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export function getEditor() {
  return editorInstance;
}

export function setEditorLanguage(monacoLanguageId) {
  if (!editorInstance || !monacoRef) return;
  monacoRef.editor.setModelLanguage(editorInstance.getModel(), monacoLanguageId);
}

export function getEditorValue() {
  return editorInstance ? editorInstance.getValue() : "";
}

export function setEditorValue(value) {
  if (editorInstance) editorInstance.setValue(value);
}

export function setEditorEnabled(enabled) {
  if (editorInstance) editorInstance.updateOptions({ readOnly: !enabled });
}

export function focusEditor() {
  if (editorInstance) editorInstance.focus();
}
