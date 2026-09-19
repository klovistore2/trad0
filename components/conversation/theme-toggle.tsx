"use client";

import { useEffect } from "react";

const storageKey = "a-deux-theme";

function updateBrowserColor() {
  const color = getComputedStyle(document.body).backgroundColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

export function ThemeToggle() {
  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      if (event.newValue === "light" || event.newValue === "dark") {
        document.documentElement.dataset.theme = event.newValue;
      } else {
        delete document.documentElement.dataset.theme;
      }
      updateBrowserColor();
    };
    updateBrowserColor();
    systemTheme.addEventListener("change", updateBrowserColor);
    window.addEventListener("storage", syncStorage);
    return () => {
      systemTheme.removeEventListener("change", updateBrowserColor);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  function toggle() {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = dark ? "light" : "dark";
    root.dataset.theme = theme;
    try { localStorage.setItem(storageKey, theme); } catch { /* The toggle also works without storage. */ }
    updateBrowserColor();
  }

  return <button type="button" className="theme-toggle" onClick={toggle} aria-label="Changer le thème clair ou sombre" title="Changer le thème clair ou sombre">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
    </svg>
  </button>;
}
