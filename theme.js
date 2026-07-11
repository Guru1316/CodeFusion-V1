// theme.js — handles dark/light theme state, persistence, and toggle UI.

const STORAGE_KEY = "codefusion:theme";
const root = document.documentElement;

/**
 * List of listeners to notify whenever the theme changes (e.g. the editor
 * module needs to swap the Monaco theme in sync with the CSS theme).
 */
const listeners = [];

export function onThemeChange(callback) {
  listeners.push(callback);
}

export function getTheme() {
  return root.getAttribute("data-theme") || "dark";
}

export function applyTheme(theme, { persist = true } = {}) {
  root.setAttribute("data-theme", theme);
  if (persist) localStorage.setItem(STORAGE_KEY, theme);
  listeners.forEach((fn) => fn(theme));
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const preferred = saved || "dark"; // dark is the product default
  applyTheme(preferred, { persist: false });
}

function bindToggle() {
  const toggleBtn = document.getElementById("themeToggle");
  toggleBtn.addEventListener("click", () => {
    const next = getTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

initTheme();
bindToggle();
