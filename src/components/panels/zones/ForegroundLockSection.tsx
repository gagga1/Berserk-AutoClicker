import { useState } from "react";
import type { Settings } from "../../../store";
import { invoke } from "@tauri-apps/api/core";
import {
  Disableable,
  ToggleBtn,
  CardDivider,
  InfoIcon,
} from "../advanced/shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function ForegroundLockSection({
  settings,
  update,
  showInfo,
}: Props) {
  const [picking, setPicking] = useState(false);

  const handlePickCurrent = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const title = await invoke<string>("get_foreground_window_title");
      if (title) {
        update({ foregroundLockTitle: title });
      }
    } catch (err) {
      console.error("Get foreground title failed:", err);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="adv-sectioncontainer">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon text="Click only when the foreground window title contains this string. Loop keeps running but skips clicks while focus is elsewhere." />
          ) : null}
          <span className="adv-card-title">App Lock</span>
        </div>
        <ToggleBtn
          value={settings.foregroundLockEnabled}
          onChange={(v) => update({ foregroundLockEnabled: v })}
        />
      </div>
      <CardDivider />
      <Disableable enabled={settings.foregroundLockEnabled}>
        <div className="adv-stop-zone-body">
          <div className="adv-stop-zone-controls">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                style={{
                  fontFamily: "var(--font-family-mono)",
                  fontSize: "0.78rem",
                  letterSpacing: "1.5px",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                }}
              >
                Window title contains
              </label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  value={settings.foregroundLockTitle}
                  onChange={(e) =>
                    update({ foregroundLockTitle: e.target.value })
                  }
                  placeholder="e.g. Minecraft, Roblox, chrome"
                  spellCheck={false}
                  autoCorrect="off"
                  style={{
                    flex: 1,
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-family-mono)",
                    fontSize: "0.95rem",
                    letterSpacing: "1px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  className="adv-secondary-btn"
                  onClick={handlePickCurrent}
                  disabled={picking}
                  title="Use current foreground window"
                >
                  {picking ? "Picking..." : "Use current"}
                </button>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-family-mono)",
                  fontSize: "0.7rem",
                  letterSpacing: "1px",
                  color: "var(--text-faint)",
                }}
              >
                substring match · case insensitive
              </span>
            </div>
          </div>
        </div>
      </Disableable>
    </div>
  );
}
