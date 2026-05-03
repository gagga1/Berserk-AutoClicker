import type { Settings } from "./store";

export type GamePresetId = "roblox" | "minecraft";

export interface GamePreset {
  id: GamePresetId;
  label: string;
  description: string;
  patch: Partial<Settings>;
}

const ROBLOX_PATCH: Partial<Settings> = {
  clickSpeed: 18,
  clickInterval: "s",
  rateInputMode: "rate",
  mouseButton: "Left",
  mode: "Toggle",
  dutyCycleEnabled: true,
  dutyCycle: 50,
  speedVariationEnabled: false,
  speedVariation: 0,
  doubleClickEnabled: false,
};

// Minecraft PvP — human-like clicker, high jitter, lower CPS.
const MINECRAFT_PATCH: Partial<Settings> = {
  clickSpeed: 11,
  clickInterval: "s",
  rateInputMode: "rate",
  mouseButton: "Left",
  mode: "Hold",
  dutyCycleEnabled: true,
  dutyCycle: 38,
  speedVariationEnabled: true,
  speedVariation: 55,
  doubleClickEnabled: false,
};

export const GAME_PRESETS: readonly GamePreset[] = [
  {
    id: "roblox",
    label: "Roblox",
    description: "Linear · 18 cps · no jitter",
    patch: ROBLOX_PATCH,
  },
  {
    id: "minecraft",
    label: "Minecraft",
    description: "Human PvP · 11 cps · jitter 55%",
    patch: MINECRAFT_PATCH,
  },
] as const;
