/**
 * SynthEdge Theme Store — dark/light mode with localStorage persistence.
 * Chart renderer reads CHART_THEMES[currentTheme] for canvas colors.
 */

export const THEMES = ["dark", "light"];

export function getStoredTheme() {
  return localStorage.getItem("synthEdgeTheme") || "light";
}

export function setStoredTheme(theme) {
  localStorage.setItem("synthEdgeTheme", theme);
  applyThemeToDOM(theme);
}

export function applyThemeToDOM(theme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.add("light-theme");
    root.classList.remove("dark");
  } else {
    root.classList.remove("light-theme");
    root.classList.add("dark");
  }
}

export const CHART_THEMES = {
  dark: {
    bg:        "hsl(222, 41%, 9%)",
    grid:      "hsla(222, 20%, 22%, 0.75)",
    axisText:  "hsl(215, 20%, 40%)",
    timeText:  "hsl(215, 20%, 36%)",
    bull:      "hsl(142, 71%, 45%)",
    bear:      "hsl(0, 72%, 51%)",
    price:     "hsl(217, 91%, 60%)",
    handle:    "hsl(217, 91%, 70%)",
    handleHot: "hsl(217, 91%, 90%)",
    selected:  "hsl(217, 91%, 75%)",
    drawing:   "hsl(45, 93%, 58%)",
    posEntry:  "hsl(217, 91%, 65%)",
    posTP:     "hsl(142, 71%, 45%)",
    posSL:     "hsl(0, 72%, 51%)",
    panelBg:   "hsla(222, 41%, 7%, 0.82)",
    panelLine: "hsla(222, 20%, 25%, 0.85)",
    axisBg:    "hsla(222, 41%, 7%, 0.95)",
  },
  light: {
  bg:        "hsl(220, 20%, 97%)",
  grid:      "hsla(220, 15%, 78%, 0.9)",
  axisText:  "hsl(220, 15%, 45%)",
  timeText:  "hsl(220, 15%, 52%)",
    bull:      "hsl(142, 65%, 38%)",
    bear:      "hsl(0, 68%, 46%)",
    price:     "hsl(217, 85%, 50%)",
    handle:    "hsl(217, 85%, 55%)",
    handleHot: "hsl(217, 85%, 30%)",
    selected:  "hsl(217, 85%, 45%)",
    drawing:   "hsl(35, 90%, 45%)",
    posEntry:  "hsl(217, 85%, 50%)",
    posTP:     "hsl(142, 65%, 38%)",
    posSL:     "hsl(0, 68%, 46%)",
    panelBg:   "hsla(220, 20%, 93%, 0.95)",
    panelLine: "hsla(220, 15%, 80%, 0.9)",
    axisBg:    "hsla(220, 20%, 95%, 0.98)",
  },
};
