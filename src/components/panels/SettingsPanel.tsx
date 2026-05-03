import "./SettingsPanel.css";
import type {
  AppInfo,
  PresetDefinition,
  PresetId,
  Settings,
} from "../../store";
import {
  isLanguage,
  LANGUAGE_OPTIONS,
  useTranslation,
  type Language,
} from "../../i18n";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import ConfirmDialog from "../ConfirmDialog";
import { AdvDropdown } from "./advanced/shared";
import {
  DEFAULT_ACCENT_COLOR,
  MAX_PRESETS,
  PRESET_NAME_MAX_LENGTH,
} from "../../settingsSchema";
import { PRESET_LABELS, PRESET_LIST } from "../../accentTheme";

type PendingAction = "reset-settings" | "clear-stats" | null;

const LANGUAGE_DROPDOWN_OPTIONS = LANGUAGE_OPTIONS.map((option) => ({
  value: option.code,
  label: option.label,
}));

interface CumulativeStats {
  totalClicks: number;
  totalTimeSecs: number;
  totalSessions: number;
  avgCpu: number;
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  running: boolean;
  appInfo: AppInfo;
  onSavePreset: (name: string) => boolean;
  onApplyPreset: (presetId: PresetId) => boolean;
  onUpdatePreset: (presetId: PresetId) => boolean;
  onRenamePreset: (presetId: PresetId, name: string) => boolean;
  onDeletePreset: (presetId: PresetId) => boolean;
  onToggleAlwaysOnTop: () => Promise<void>;
  onReset: () => Promise<void>;
}

function formatTime(totalSeconds: number, language: Language): string {
  if (totalSeconds < 0.01) return "0s";
  if (totalSeconds < 60) {
    return `${Math.floor(totalSeconds).toLocaleString(language)}s`;
  }
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return s > 0
      ? `${m.toLocaleString(language)}m ${s.toLocaleString(language)}s`
      : `${m.toLocaleString(language)}m`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return m > 0
    ? `${h.toLocaleString(language)}h ${m.toLocaleString(language)}m`
    : `${h.toLocaleString(language)}h`;
}

function formatNumber(n: number, language: Language): string {
  return Math.floor(n).toLocaleString(language);
}

function formatCpu(
  cpu: number,
  language: Language,
  notAvailable: string,
): string {
  if (cpu < 0) return notAvailable;
  return `${cpu.toLocaleString(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function SettingsSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="settings-section-heading">
      <span className="settings-section-title">{title}</span>
      {description ? (
        <span className="settings-section-description">{description}</span>
      ) : null}
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`settings-card ${open ? "open" : "closed"}`}>
      <button
        type="button"
        className="settings-card-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <SettingsSectionHeading title={title} description={description} />
        <svg
          className="settings-card-chev"
          width="16"
          height="16"
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
      <div className="settings-card-content">{children}</div>
    </section>
  );
}

function PresetRow({
  preset,
  isActive,
  isEditing,
  isConfirmingDelete,
  running,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onApply,
  onUpdatePreset,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  preset: PresetDefinition;
  isActive: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  running: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onApply: () => void;
  onUpdatePreset: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`preset-card ${isActive ? "preset-card--active" : ""}`}
      data-preset-id={preset.id}
    >
      <div className="preset-card-head">
        <div className="preset-card-meta">
          {isEditing ? (
            <input
              className="preset-rename-input"
              value={renameDraft}
              maxLength={PRESET_NAME_MAX_LENGTH}
              onChange={(event) => onRenameDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              autoFocus
            />
          ) : (
            <span className="preset-name">{preset.name}</span>
          )}
          <div className="preset-badges">
            {isActive && (
              <span className="preset-badge preset-badge--active">
                {t("settings.presetActive")}
              </span>
            )}
            <span className="preset-badge">
              {new Date(preset.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="preset-actions">
          {isEditing ? (
            <>
              <button
                className="settings-btn-secondary"
                onClick={onCommitRename}
                disabled={running}
              >
                {t("settings.presetSave")}
              </button>
              <button className="settings-btn-quiet" onClick={onCancelRename}>
                {t("settings.presetCancel")}
              </button>
            </>
          ) : isConfirmingDelete ? (
            <>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={onConfirmDelete}
                disabled={running}
              >
                {t("settings.presetConfirmDelete")}
              </button>
              <button className="settings-btn-quiet" onClick={onCancelDelete}>
                {t("settings.presetCancel")}
              </button>
            </>
          ) : (
            <>
              <button
                className="settings-btn-primary"
                onClick={onApply}
                disabled={running}
              >
                {t("settings.presetApply")}
              </button>
              <button
                className="settings-btn-secondary"
                onClick={onUpdatePreset}
                disabled={running}
              >
                {t("settings.presetUpdate")}
              </button>
              <button
                className="settings-btn-secondary"
                onClick={onStartRename}
                disabled={running}
              >
                {t("settings.presetRename")}
              </button>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={onRequestDelete}
                disabled={running}
              >
                {t("settings.presetDelete")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WindowProfilesEditor({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const rules = settings.windowProfiles ?? [];
  const presets = settings.presets;
  const hasPresets = presets.length > 0;

  const newId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleAdd = () => {
    if (!hasPresets) return;
    const next = [
      ...rules,
      {
        id: newId(),
        titlePattern: "",
        presetId: presets[0].id,
      },
    ];
    update({ windowProfiles: next });
  };

  const handleUpdate = (id: string, patch: Partial<Settings["windowProfiles"][number]>) => {
    update({
      windowProfiles: rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const handleDelete = (id: string) => {
    update({ windowProfiles: rules.filter((r) => r.id !== id) });
  };

  if (!hasPresets) {
    return (
      <div className="stats-empty">
        Save at least one preset to create a window profile rule.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {rules.map((rule) => (
        <div
          key={rule.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 160px auto",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={rule.titlePattern}
            placeholder="Window title contains..."
            onChange={(e) =>
              handleUpdate(rule.id, { titlePattern: e.target.value })
            }
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "7px 10px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-family-mono)",
              fontSize: "0.9rem",
              outline: "none",
            }}
          />
          <select
            value={rule.presetId}
            onChange={(e) => handleUpdate(rule.id, { presetId: e.target.value })}
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "7px 10px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-family-base)",
              fontSize: "0.85rem",
              outline: "none",
            }}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="settings-btn-quiet"
            onClick={() => handleDelete(rule.id)}
            aria-label="Delete rule"
            title="Delete rule"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="settings-btn-secondary"
        onClick={handleAdd}
        disabled={rules.length >= 30}
      >
        + Add rule
      </button>
      <div
        style={{
          fontFamily: "var(--font-family-mono)",
          fontSize: "0.7rem",
          color: "var(--text-faint)",
          letterSpacing: "1px",
        }}
      >
        Substring match · case insensitive · checked every 1.5s · paused while running
      </div>
    </div>
  );
}

export default function SettingsPanel({
  settings,
  update,
  running,
  appInfo,
  onSavePreset,
  onApplyPreset,
  onUpdatePreset,
  onRenamePreset,
  onDeletePreset,
  onToggleAlwaysOnTop,
  onReset,
}: Props) {
  const [resetting, setResetting] = useState(false);
  const [resettingStats, setResettingStats] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [stats, setStats] = useState<CumulativeStats | null>(null);
  const [atBottom, setAtBottom] = useState(false);
  const [presetsAtBottom, setPresetsAtBottom] = useState(true);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<PresetId | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<PresetId | null>(
    null,
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const presetsListRef = useRef<HTMLDivElement>(null);
  const { language, t } = useTranslation();

  useEffect(() => {
    invoke<CumulativeStats>("get_stats")
      .then(setStats)
      .catch(() => {});
    invoke<boolean>("get_autostart_enabled")
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  useEffect(() => {
    if (!confirmingDeleteId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const presetCard = target.closest("[data-preset-id]");
      if (presetCard?.getAttribute("data-preset-id") === confirmingDeleteId) {
        return;
      }

      setConfirmingDeleteId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [confirmingDeleteId]);

  const handleScroll = () => {
    const el = panelRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };

  const handlePresetsScroll = () => {
    const el = presetsListRef.current;
    if (!el) return;
    setPresetsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };

  const handleSavePreset = () => {
    if (onSavePreset(newPresetName)) {
      setNewPresetName("");
      setConfirmingDeleteId(null);
    }
  };

  const handleStartRename = (preset: PresetDefinition) => {
    setConfirmingDeleteId(null);
    setEditingPresetId(preset.id);
    setRenameDraft(preset.name);
  };

  const handleCommitRename = () => {
    if (!editingPresetId) {
      return;
    }

    if (onRenamePreset(editingPresetId, renameDraft)) {
      setEditingPresetId(null);
      setRenameDraft("");
    }
  };

  const handleCancelRename = () => {
    setEditingPresetId(null);
    setRenameDraft("");
  };

  const handleRequestDelete = (presetId: PresetId) => {
    setEditingPresetId(null);
    setRenameDraft("");
    setConfirmingDeleteId(presetId);
  };

  const handleConfirmDelete = (presetId: PresetId) => {
    if (onDeletePreset(presetId)) {
      setConfirmingDeleteId(null);
    }
  };

  const handleAlwaysOnTopChange = (nextValue: boolean) => {
    if (settings.alwaysOnTop === nextValue) {
      return;
    }

    void onToggleAlwaysOnTop();
  };

  const hasStats = stats !== null && stats.totalSessions > 0;
  const presetLimitReached = settings.presets.length >= MAX_PRESETS;
  const activeEditingPresetId = running ? null : editingPresetId;
  const activeConfirmingDeleteId = running ? null : confirmingDeleteId;
  const onOffOptions = [
    { value: true, label: t("common.on") },
    { value: false, label: t("common.off") },
  ];

  const handleConfirmResetSettings = async () => {
    setResetting(true);
    try {
      await onReset();
      setAutostartEnabled(false);
    } finally {
      setResetting(false);
      setPendingAction(null);
    }
  };

  const handleConfirmClearStats = async () => {
    setResettingStats(true);
    try {
      const next = await invoke<CumulativeStats>("reset_stats");
      setStats(next);
    } catch {
      // swallow ? failure leaves stats unchanged
    } finally {
      setResettingStats(false);
      setPendingAction(null);
    }
  };

  useEffect(() => {
    handlePresetsScroll();
  }, [settings.presets.length]);

  return (
    <div className="settings-wrapper">
      <div className="settings-panel" ref={panelRef} onScroll={handleScroll}>
        <SettingsCard
          title={t("settings.sectionAbout")}
          description={t("settings.sectionAboutDescription")}
        >
          <div className="social-links">
            <span className="settings-label">{t("settings.supportMe")}</span>
            <div className="social-icons">
              <a
                className="social-icon social-icon--kofi"
                href="#"
                title="Ko-fi"
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://ko-fi.com/gagga1");
                }}
              >
                <img
                  height="28"
                  style={{ border: 0, height: "28px" }}
                  src="https://storage.ko-fi.com/cdn/kofi3.png?v=6"
                  alt="Buy Me a Coffee at ko-fi.com"
                />
              </a>
              <a
                className="social-icon social-icon--github"
                href="#"
                title="GitHub"
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://github.com/gagga1/Berserk-AutoClicker");
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="18"
                  height="18"
                >
                  <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.8 1.8 3.4 1.2.1-.7.4-1.2.7-1.5-2.7-.3-5.4-1.3-5.4-6a4.7 4.7 0 0 1 1.2-3.2c-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.2 11.2 0 0 1 6.1 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2a4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.8 5.7-5.4 6 .4.3.8 1 .8 2.1v3.1c0 .4.2.7.8.6A12 12 0 0 0 12 .3" />
                </svg>
              </a>
              <a
                className="social-icon social-icon--discord"
                href="#"
                title="Discord"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Soon...");
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="18"
                  height="18"
                >
                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.074.035c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.08.08 0 0 0-.073-.035 19.74 19.74 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.08.08 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.099.246.197.373.291a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.04.106c.36.7.772 1.364 1.225 1.994a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">{t("settings.version")}</span>
            <span className="settings-value">v{appInfo.version}</span>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings.sectionUsage")}
          description={t("settings.sectionUsageDescription")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">{t("settings.usageData")}</span>
              <span className="settings-sublabel">
                {t("settings.usageDataDescription")}
              </span>
            </div>
          </div>
          {hasStats ? (
            <div className="stats-grid">
              <div className="stats-cell">
                <span className="stats-cell-label">
                  {t("settings.totalClicks")}
                </span>
                <span className="stats-cell-value">
                  {formatNumber(stats.totalClicks, language)}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">
                  {t("settings.totalTimeClicking")}
                </span>
                <span className="stats-cell-value">
                  {formatTime(stats.totalTimeSecs, language)}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">
                  {t("settings.averageCpu")}
                </span>
                <span className="stats-cell-value">
                  {formatCpu(stats.avgCpu, language, t("common.notAvailable"))}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">
                  {t("settings.sessions")}
                </span>
                <span className="stats-cell-value">
                  {formatNumber(stats.totalSessions, language)}
                </span>
              </div>
            </div>
          ) : (
            <div className="stats-empty">{t("settings.noRuns")}</div>
          )}
          {hasStats && (
            <div className="settings-row">
              <div className="settings-label-group">
                <span className="settings-label">
                  {t("settings.clearStats")}
                </span>
                <span className="settings-sublabel">
                  {t("settings.clearStatsDescription")}
                </span>
              </div>
              <button
                type="button"
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={() => setPendingAction("clear-stats")}
              >
                {t("settings.clearStats")}
              </button>
            </div>
          )}
        </SettingsCard>

        <SettingsCard
          title={t("settings.sectionPresets")}
          description={t("settings.sectionPresetsDescription")}
        >
          <div className="settings-row settings-row--stacked">
            <div className="settings-label-group">
              <span className="settings-label">{t("settings.presets")}</span>
              <span className="settings-sublabel">
                {t("settings.presetsDescription")}
              </span>
            </div>
            <div className="preset-compose">
              <input
                className="preset-name-input"
                placeholder={t("settings.presetNamePlaceholder")}
                value={newPresetName}
                maxLength={PRESET_NAME_MAX_LENGTH}
                onChange={(event) => setNewPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (
                      !running &&
                      !presetLimitReached &&
                      newPresetName.trim()
                    ) {
                      handleSavePreset();
                    }
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setNewPresetName("");
                  }
                }}
                disabled={running}
              />
              <button
                className="settings-btn-primary"
                onClick={handleSavePreset}
                disabled={
                  running ||
                  presetLimitReached ||
                  newPresetName.trim().length === 0
                }
              >
                {t("settings.saveNewPreset")}
              </button>
            </div>
            {presetLimitReached && (
              <span className="settings-note">
                {t("settings.presetLimitReached")}
              </span>
            )}
            {running && (
              <span className="settings-note">
                {t("settings.presetActionsDisabled")}
              </span>
            )}
            {settings.presets.length > 0 ? (
              <div className="preset-list-shell">
                <div
                  className="preset-list"
                  ref={presetsListRef}
                  onScroll={handlePresetsScroll}
                >
                  {settings.presets.map((preset) => (
                    <PresetRow
                      key={preset.id}
                      preset={preset}
                      isActive={settings.activePresetId === preset.id}
                      isEditing={activeEditingPresetId === preset.id}
                      isConfirmingDelete={
                        activeConfirmingDeleteId === preset.id
                      }
                      running={running}
                      renameDraft={
                        activeEditingPresetId === preset.id
                          ? renameDraft
                          : preset.name
                      }
                      onRenameDraftChange={setRenameDraft}
                      onStartRename={() => handleStartRename(preset)}
                      onCancelRename={handleCancelRename}
                      onCommitRename={handleCommitRename}
                      onApply={() => {
                        setConfirmingDeleteId(null);
                        onApplyPreset(preset.id);
                      }}
                      onUpdatePreset={() => {
                        setConfirmingDeleteId(null);
                        onUpdatePreset(preset.id);
                      }}
                      onRequestDelete={() => handleRequestDelete(preset.id)}
                      onCancelDelete={() => setConfirmingDeleteId(null)}
                      onConfirmDelete={() => handleConfirmDelete(preset.id)}
                    />
                  ))}
                </div>
                <div
                  className={`preset-list-fade ${presetsAtBottom ? "preset-list-fade--hidden" : ""}`}
                />
              </div>
            ) : (
              <div className="stats-empty">{t("settings.noPresets")}</div>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Window Profiles"
          description="Auto-apply a preset when a foreground window's title matches the pattern."
          defaultOpen={false}
        >
          <WindowProfilesEditor settings={settings} update={update} />
        </SettingsCard>

        <SettingsCard
          title={t("settings.sectionBehavior")}
          description={t("settings.sectionBehaviorDescription")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings.alwaysOnTop")}
              </span>
              <span className="settings-sublabel">
                {t("settings.alwaysOnTopDescription")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.alwaysOnTop === option.value ? "active" : ""}`}
                  onClick={() => handleAlwaysOnTopChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings.stopHitboxOverlay")}
              </span>
              <span className="settings-sublabel">
                {t("settings.stopHitboxOverlayDescription")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.showStopOverlay === option.value ? "active" : ""}`}
                  onClick={() => update({ showStopOverlay: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Floating HUD</span>
              <span className="settings-sublabel">
                Small always-on-top widget showing live CPS + click count while running.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.hudEnabled === option.value ? "active" : ""}`}
                  onClick={() => update({ hudEnabled: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Start/stop sound</span>
              <span className="settings-sublabel">
                Audible cue when the clicker engages or stops.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.soundEnabled === option.value ? "active" : ""}`}
                  onClick={() => update({ soundEnabled: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings.stopReasonAlert")}
              </span>
              <span className="settings-sublabel">
                {t("settings.stopReasonAlertDescription")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.showStopReason === option.value ? "active" : ""}`}
                  onClick={() => update({ showStopReason: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings.strictHotkeyModifiers")}
              </span>
              <span className="settings-sublabel">
                {t("settings.strictHotkeyModifiersDescription")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.strictHotkeyModifiers === option.value ? "active" : ""}`}
                  onClick={() =>
                    update({ strictHotkeyModifiers: option.value })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings.sectionStartup")}
          description={t("settings.sectionStartupDescription")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings.minimizeToTray")}
              </span>
              <span className="settings-sublabel">
                {t("settings.minimizeToTrayDescription")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.minimizeToTray === option.value ? "active" : ""}`}
                  onClick={() => update({ minimizeToTray: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings.runOnStartup")}
              </span>
              <span className="settings-sublabel">
                {t("settings.runOnStartupDescription")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${autostartEnabled === option.value ? "active" : ""}`}
                  disabled={autostartEnabled === null}
                  onClick={() => {
                    invoke("set_autostart_enabled", { enabled: option.value })
                      .then(() => setAutostartEnabled(option.value))
                      .catch(console.error);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings.sectionAppearance")}
          description={t("settings.sectionAppearanceDescription")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">{t("settings.language")}</span>
              <span className="settings-sublabel">
                {t("settings.languageDescription")}
              </span>
            </div>
            <AdvDropdown
              value={settings.language}
              options={LANGUAGE_DROPDOWN_OPTIONS}
              onChange={(next) => {
                if (isLanguage(next)) {
                  update({ language: next });
                }
              }}
            />
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">{t("settings.theme")}</span>
              <span className="settings-sublabel">
                {t("settings.themeDescription")}
              </span>
            </div>
            <div className="settings-seg-group">
              {(["dark", "light"] as const).map((theme) => (
                <button
                  key={theme}
                  className={`settings-seg-btn ${settings.theme === theme ? "active" : ""}`}
                  onClick={() => update({ theme })}
                >
                  {t(theme === "dark" ? "common.dark" : "common.light")}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Theme Preset</span>
              <span className="settings-sublabel">
                Pick the Berserk palette
              </span>
            </div>
            <div className="settings-seg-group settings-preset-group">
              {PRESET_LIST.map((preset) => (
                <button
                  key={preset}
                  className={`settings-seg-btn settings-preset-btn settings-preset-${preset} ${(settings.themePreset ?? "red") === preset ? "active" : ""}`}
                  onClick={() => update({ themePreset: preset })}
                  title={PRESET_LABELS[preset]}
                >
                  <span className="settings-preset-swatch" />
                  {PRESET_LABELS[preset]}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings.accentColor")}
              </span>
              <span className="settings-sublabel">
                {t("settings.accentColorDescription")}
              </span>
            </div>
            <div className="settings-color-controls">
              <label className="settings-color-picker">
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={(event) =>
                    update({ accentColor: event.target.value })
                  }
                />
              </label>
              <span className="settings-value settings-value--mono">
                {settings.accentColor.toUpperCase()}
              </span>
              <button
                className="settings-btn-secondary"
                onClick={() => update({ accentColor: DEFAULT_ACCENT_COLOR })}
                disabled={settings.accentColor === DEFAULT_ACCENT_COLOR}
              >
                {t("common.reset")}
              </button>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings.sectionReset")}
          description={t("settings.sectionResetDescription")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">{t("settings.resetAll")}</span>
              <span className="settings-sublabel">
                {t("settings.resetAllDescription")}
              </span>
            </div>
            <button
              className="settings-btn-danger"
              onClick={() => setPendingAction("reset-settings")}
            >
              {t("common.reset")}
            </button>
          </div>
        </SettingsCard>
      </div>
      <div
        className={`settings-fade ${atBottom ? "settings-fade--hidden" : ""}`}
      ></div>
      <ConfirmDialog
        open={pendingAction === "reset-settings"}
        title={t("settings.resetDialogTitle")}
        message={t("settings.resetDialogMessage")}
        confirmLabel={t("settings.resetDialogConfirm")}
        busy={resetting}
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "clear-stats"}
        title={t("settings.clearStatsDialogTitle")}
        message={t("settings.clearStatsDialogMessage")}
        confirmLabel={t("settings.clearStatsDialogConfirm")}
        busy={resettingStats}
        onConfirm={handleConfirmClearStats}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
