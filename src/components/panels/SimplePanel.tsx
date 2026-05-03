import { useEffect, useState, type CSSProperties, type ChangeEvent, type ReactNode, type WheelEvent } from "react";
import type { MouseButton, Settings } from "../../store";
import { useTranslation, type TranslationKey } from "../../i18n";
import CadenceInput from "../CadenceInput";
import HotkeyCaptureInput from "../HotkeyCaptureInput";
import ClickCurveEditor from "../ClickCurveEditor";
import { GAME_PRESETS } from "../../gamePresets";
import {
  MODE_OPTIONS,
  MOUSE_BUTTON_OPTIONS,
  SETTINGS_LIMITS,
} from "../../settingsSchema";
import "./SimplePanel.css";

interface SimplePanelProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

function normalizeRaw(raw: string) {
  return raw.replace(/^0+(?=\d)/, "");
}

function parseRawNumber(raw: string) {
  const normalized = normalizeRaw(raw);
  return normalized === "" ? 0 : Number(normalized);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dynamicChWidth(value: number, min = 1, max = 3) {
  return `${clamp(String(value).length, min, max)}ch`;
}

function handleWheelStep(
  event: WheelEvent<HTMLInputElement>,
  current: number,
  min: number,
  max: number,
  apply: (next: number) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.blur();
  const delta = event.deltaY < 0 ? 1 : -1;
  apply(clamp(current + delta, min, max));
}

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="sp-seg" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`sp-seg-btn ${value === opt.value ? "active" : ""}`}
          onClick={() => onChange(opt.value)}
          role="tab"
          aria-selected={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SectionRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="sp-row">
      <div className="sp-label">{label}</div>
      <div className="sp-val">{children}</div>
    </div>
  );
}

function NumberChip({
  value,
  min,
  max,
  onChange,
  unit,
  width,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  unit: string;
  width: string;
}) {
  return (
    <div className="sp-numchip">
      <input
        type="number"
        className="sp-numchip-input"
        style={{ width, minWidth: "1ch" } as CSSProperties}
        value={value}
        min={min}
        max={max}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const normalized = normalizeRaw(event.target.value);
          if (normalized !== event.target.value) {
            event.target.value = normalized;
          }
          onChange(parseRawNumber(normalized));
        }}
        onBlur={(event) => {
          const normalized = normalizeRaw(event.target.value);
          if (normalized !== event.target.value) {
            event.target.value = normalized;
          }
          onChange(clamp(parseRawNumber(normalized), min, max));
        }}
        onWheel={(event) =>
          handleWheelStep(event, value, min, max, (next) => onChange(next))
        }
      />
      <span className="sp-numchip-unit">{unit}</span>
    </div>
  );
}

export default function SimplePanel({ settings, update }: SimplePanelProps) {
  const { t } = useTranslation();
  const [curveOpen, setCurveOpen] = useState(false);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("simple-curve-state", {
        detail: { open: curveOpen },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("simple-curve-state", {
          detail: { open: false },
        }),
      );
    };
  }, [curveOpen]);

  const isShortHotkey = (() => {
    const raw = settings.hotkey.trim();
    if (!raw) return true;
    const parts = raw.split("+").filter(Boolean);
    return parts.length <= 2 && raw.length <= 10;
  })();

  const clickModeOptions = MODE_OPTIONS.map((mode) => ({
    value: mode,
    label: t(`options.mode.${mode}` as TranslationKey),
  }));

  const mouseButtonOptions = MOUSE_BUTTON_OPTIONS.map((button) => ({
    value: button,
    label: t(`options.mouseButton.${button}` as TranslationKey),
  }));

  return (
    <div className="simple-panel-v2">
      <SectionRow label={t("simple.clickRate")}>
        <div className="sp-cadence-wrap">
          <CadenceInput settings={settings} update={update} variant="simple" />
        </div>
        <div className="sp-meta">
          <span className="sp-meta-key">duty</span>
          <NumberChip
            value={settings.dutyCycle}
            min={SETTINGS_LIMITS.dutyCycle.min}
            max={SETTINGS_LIMITS.dutyCycle.max}
            onChange={(next) => update({ dutyCycle: next })}
            unit="%"
            width={dynamicChWidth(settings.dutyCycle)}
          />
          <span className="sp-meta-key">jitter</span>
          <NumberChip
            value={settings.speedVariation}
            min={SETTINGS_LIMITS.speedVariation.min}
            max={SETTINGS_LIMITS.speedVariation.max}
            onChange={(next) => update({ speedVariation: next })}
            unit="%"
            width={dynamicChWidth(settings.speedVariation)}
          />
        </div>
      </SectionRow>

      <div className={`sp-curve-block ${curveOpen ? "open" : "closed"}`}>
        <button
          type="button"
          className="sp-curve-toggle"
          onClick={() => setCurveOpen((v) => !v)}
          aria-expanded={curveOpen}
        >
          <span className="sp-label">Curve</span>
          <span className="sp-curve-summary">
            {curveOpen
              ? "Click to hide"
              : `${settings.dutyCycle}% duty · ${settings.speedVariation}% jitter · ${settings.speedVariationCurve ?? "gaussian"}`}
          </span>
          <svg
            className="sp-curve-chev"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div className="sp-curve-content">
          <ClickCurveEditor
            cps={settings.clickSpeed}
            duty={settings.dutyCycle}
            jitter={settings.speedVariation}
            dutyMin={SETTINGS_LIMITS.dutyCycle.min}
            dutyMax={SETTINGS_LIMITS.dutyCycle.max}
            jitterMin={SETTINGS_LIMITS.speedVariation.min}
            jitterMax={SETTINGS_LIMITS.speedVariation.max}
            onDutyChange={(next) => update({ dutyCycle: next })}
            onJitterChange={(next) => update({ speedVariation: next })}
          />
          <Segment
            value={settings.speedVariationCurve ?? "gaussian"}
            options={[
              { value: "gaussian", label: "Gaussian" },
              { value: "uniform", label: "Uniform" },
              { value: "sine", label: "Sine" },
              { value: "walk", label: "Walk" },
            ]}
            onChange={(next) =>
              update({
                speedVariationCurve: next as Settings["speedVariationCurve"],
              })
            }
          />
        </div>
      </div>

      <div className="sp-divider" />

      <SectionRow label={t("simple.trigger")}>
        <div className="sp-hotkey">
          <HotkeyCaptureInput
            className="sp-hotkey-input"
            style={{ width: isShortHotkey ? "100px" : "150px" }}
            value={settings.hotkey}
            onChange={(hotkey) => update({ hotkey })}
          />
        </div>
        <Segment
          value={settings.mode}
          options={clickModeOptions}
          onChange={(next) => update({ mode: next as Settings["mode"] })}
        />
      </SectionRow>

      <div className="sp-divider" />

      <SectionRow label={t("advanced.mouseButton")}>
        <Segment
          value={settings.mouseButton}
          options={mouseButtonOptions}
          onChange={(next) => update({ mouseButton: next as MouseButton })}
        />
        <div className="sp-game-row">
          {GAME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`sp-game-pill sp-game-${preset.id}`}
              title={preset.description}
              onClick={() => update(preset.patch)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </SectionRow>
    </div>
  );
}
