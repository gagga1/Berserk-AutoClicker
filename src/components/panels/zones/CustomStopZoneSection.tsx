import { useState } from "react";
import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { invoke } from "@tauri-apps/api/core";
import {
  Disableable,
  NumInput,
  ToggleBtn,
  CardDivider,
  InfoIcon,
} from "../advanced/shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

interface PickRect {
  x: number;
  y: number;
  width: number;
  height: number;
  cancelled?: boolean;
}

export default function CustomStopZoneSection({
  settings,
  update,
  showInfo,
}: Props) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);

  const handlePick = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const rect = await invoke<PickRect>("pick_zone");
      if (rect.width >= 1 && rect.height >= 1) {
        update({
          customStopZoneX: rect.x,
          customStopZoneY: rect.y,
          customStopZoneWidth: rect.width,
          customStopZoneHeight: rect.height,
        });
      }
    } catch (err) {
      console.error("Pick failed:", err);
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
            <InfoIcon text={t("advanced.customStopZoneDescription")} />
          ) : null}
          <span className="adv-card-title">{t("advanced.customStopZone")}</span>
        </div>
        <ToggleBtn
          value={settings.customStopZoneEnabled}
          onChange={(v) => update({ customStopZoneEnabled: v })}
        />
      </div>
      <CardDivider />
      <Disableable enabled={settings.customStopZoneEnabled}>
        <div className="adv-stop-zone-body">
          <div className="adv-stop-zone-controls">
            <div className="adv-stop-zone-grid">
              <div className="adv-numbox-sm adv-sequence-coord adv-stop-zone-input">
                <span className="adv-unit adv-axis-label">X</span>
                <NumInput
                  value={settings.customStopZoneX}
                  onChange={(v) => update({ customStopZoneX: v })}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
              <div className="adv-numbox-sm adv-sequence-coord adv-stop-zone-input">
                <span className="adv-unit adv-axis-label">Y</span>
                <NumInput
                  value={settings.customStopZoneY}
                  onChange={(v) => update({ customStopZoneY: v })}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
              <div className="adv-numbox-sm adv-sequence-coord adv-stop-zone-input">
                <span className="adv-unit">W</span>
                <NumInput
                  value={settings.customStopZoneWidth}
                  onChange={(v) => update({ customStopZoneWidth: v })}
                  min={1}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
              <div className="adv-numbox-sm adv-sequence-coord adv-stop-zone-input">
                <span className="adv-unit">H</span>
                <NumInput
                  value={settings.customStopZoneHeight}
                  onChange={(v) => update({ customStopZoneHeight: v })}
                  min={1}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
            </div>
            <div className="adv-sequence-actions adv-stop-zone-actions">
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={handlePick}
                disabled={picking}
              >
                {picking ? "Picking..." : "Pick zone"}
              </button>
            </div>
          </div>
        </div>
      </Disableable>
    </div>
  );
}
