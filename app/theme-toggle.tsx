"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("learning-engine-theme", next); } catch { /* Theme still works for this page. */ }
  }

  return <button type="button" className="theme-toggle glass" onClick={toggleTheme} aria-label="Switch light or dark appearance" title="Switch appearance">
    <Moon className="moon-icon" size={18} aria-hidden="true" />
    <Sun className="sun-icon" size={18} aria-hidden="true" />
  </button>;
}
