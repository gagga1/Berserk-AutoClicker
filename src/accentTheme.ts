import type { Theme, ThemePreset } from "./settingsSchema";

type RGB = {
  r: number;
  g: number;
  b: number;
};

function hexToRgb(hex: string): RGB {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function rgba({ r, g, b }: RGB, alpha: number) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyAccentTheme(accentColor: string, theme: Theme) {
  const root = document.documentElement;
  const rgb = hexToRgb(accentColor);
  const accentAlpha = theme === "light" ? 0.9 : 0.75;
  const strongAlpha = theme === "light" ? 1 : 0.92;
  const softAlpha = theme === "light" ? 0.2 : 0.15;
  const ringAlpha = theme === "light" ? 0.4 : 0.35;
  const glowPrimaryAlpha = theme === "light" ? 0.16 : 0.2;
  const glowSecondaryAlpha = theme === "light" ? 0.08 : 0.12;

  root.style.setProperty("--accent-green", rgba(rgb, accentAlpha));
  root.style.setProperty("--accent-green-strong", rgba(rgb, strongAlpha));
  root.style.setProperty("--accent-green-soft", rgba(rgb, softAlpha));
  root.style.setProperty("--accent-green-ring", rgba(rgb, ringAlpha));
  root.style.setProperty("--accent-green-glow-1", rgba(rgb, glowPrimaryAlpha));
  root.style.setProperty("--accent-green-glow-2", rgba(rgb, glowSecondaryAlpha));
}

// === Theme presets — primary brand color (Berserk red / Eclipse black / Behelit gold) ===

interface PresetPalette {
  primary: string;
  primaryStrong: string;
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgSidebar: string;
  border: string;
  borderSubtle: string;
}

const PRESETS: Record<ThemePreset, PresetPalette> = {
  red: {
    primary: "#c44",
    primaryStrong: "#d65555",
    bgBase: "#1c1c1e",
    bgSurface: "#161618",
    bgElevated: "#1f1f22",
    bgSidebar: "#141416",
    border: "#2a2a30",
    borderSubtle: "#232326",
  },
  black: {
    primary: "#9a9a9a",
    primaryStrong: "#cfcfcf",
    bgBase: "#0a0a0c",
    bgSurface: "#08080a",
    bgElevated: "#101012",
    bgSidebar: "#050507",
    border: "#1f1f23",
    borderSubtle: "#16161a",
  },
  gold: {
    primary: "#d4b04a",
    primaryStrong: "#e8c560",
    bgBase: "#1c1814",
    bgSurface: "#171410",
    bgElevated: "#22201a",
    bgSidebar: "#13110d",
    border: "#352f24",
    borderSubtle: "#28241c",
  },
};

export function applyThemePreset(preset: ThemePreset) {
  const root = document.documentElement;
  const p = PRESETS[preset];

  const primaryRgb = hexToRgb(p.primary);
  const strongRgb = hexToRgb(p.primaryStrong);

  root.style.setProperty("--berserk-red", p.primary);
  root.style.setProperty("--berserk-red-strong", p.primaryStrong);
  root.style.setProperty("--berserk-red-soft", rgba(primaryRgb, 0.14));
  root.style.setProperty("--berserk-red-ring", rgba(strongRgb, 0.4));

  root.style.setProperty("--bg-base", p.bgBase);
  root.style.setProperty("--bg-surface", p.bgSurface);
  root.style.setProperty("--bg-elevated", p.bgElevated);
  root.style.setProperty("--bg-sidebar", p.bgSidebar);
  root.style.setProperty("--border", p.border);
  root.style.setProperty("--border-subtle", p.borderSubtle);

  root.dataset.themePreset = preset;
}

export const PRESET_LABELS: Record<ThemePreset, string> = {
  red: "Berserk Red",
  black: "Eclipse Black",
  gold: "Behelit Gold",
};

export const PRESET_LIST: ThemePreset[] = ["red", "black", "gold"];
