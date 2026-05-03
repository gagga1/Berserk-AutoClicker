import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
} from "@tauri-apps/api/window";
import { lazy, useEffect, useRef, useState } from "react";
import { applyAccentTheme, applyThemePreset } from "./accentTheme";
import UpdateBanner from "./components/Updatebanner";
import { canonicalizeHotkeyForBackend } from "./hotkeys";
import { playStartSound, playStopSound } from "./runSound";
import { I18nProvider, isRtlLanguage } from "./i18n";
import {
  buildPresetSnapshot,
  createPresetDefinition,
  MAX_PRESETS,
  sanitizePresetName,
  type PresetId,
} from "./settingsSchema";
import {
  APP_VERSION,
  DEFAULT_SETTINGS,
  type AppInfo,
  type ClickerStatus,
  type Settings,
  clearSavedSettings,
  loadSettings,
  saveSettings,
} from "./store";

const SimplePanel = lazy(() => import("./components/panels/SimplePanel"));
const AdvancedPanel = lazy(
  () => import("./components/panels/advanced/AdvancedPanel"),
);
const ZonesPanel = lazy(() => import("./components/panels/zones/ZonesPanel"));
const SettingsPanel = lazy(() => import("./components/panels/SettingsPanel"));
const TitleBar = lazy(() => import("./components/TitleBar"));
const Sidebar = lazy(() => import("./components/Sidebar"));
export type Tab = "simple" | "advanced" | "zones" | "settings";

const BACKEND_SETTINGS_SCHEMA_VERSION = 8;
const MAX_DROPDOWN_OVERFLOW_BOTTOM = 220;
const OPERATIONAL_SETTING_KEYS = new Set<string>(
  Object.keys(buildPresetSnapshot(DEFAULT_SETTINGS)),
);

type DropdownOverflowDetail = {
  active: boolean;
  bottom?: number;
};

function getPanelSize(tab: Tab, hasUpdate: boolean, simpleCurveOpen: boolean) {
  const extra = hasUpdate ? 30 : 0;
  if (tab === "simple") {
    // Curve collapsed by default → compact panel; expanded → reveal SVG editor.
    return {
      width: 880,
      height: (simpleCurveOpen ? 690 : 380) + extra,
    };
  }
  if (tab === "settings") return { width: 740, height: 860 + extra };
  if (tab === "zones") return { width: 720, height: 540 + extra };
  return { width: 1080, height: 680 + extra };
}

const textScale = await invoke<number>("get_text_scale_factor");
await invoke("set_webview_zoom", { factor: 1.0 / textScale });

async function getClampedPanelSize(
  size: { width: number; height: number },
  textScale: number,
) {
  const monitor = await currentMonitor();
  if (!monitor) return size;

  const scale = monitor.scaleFactor || 1;
  const workAreaWidth = Math.floor(monitor.workArea.size.width / scale);
  const workAreaHeight = Math.floor(monitor.workArea.size.height / scale);
  const horizontalMargin = 24;
  const verticalMargin = 24;

  return {
    width: Math.min(
      Math.ceil(size.width * textScale),
      Math.max(360, workAreaWidth - horizontalMargin),
    ),
    height: Math.min(
      Math.ceil(size.height * textScale),
      Math.max(220, workAreaHeight - verticalMargin),
    ),
  };
}

const DEFAULT_STATUS: ClickerStatus = {
  running: false,
  clickCount: 0,
  lastError: null,
  stopReason: null,
  activeSequenceIndex: null,
};

const DEFAULT_APP_INFO: AppInfo = {
  version: APP_VERSION,
  updateStatus: "Update checks are disabled in development",
  screenshotProtectionSupported: false,
};

type UpdateSettingsOptions = {
  preserveActivePreset?: boolean;
};

async function syncSettingsToBackend(settings: Settings) {
  await invoke("update_settings", {
    settings: {
      ...settings,
      version: BACKEND_SETTINGS_SCHEMA_VERSION,
    },
  });
}

async function registerHotkeyCandidate(hotkey: string) {
  const canonicalHotkey = await canonicalizeHotkeyForBackend(hotkey);
  return invoke<string>("register_hotkey", { hotkey: canonicalHotkey });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function App() {
  const [tab, setTab] = useState<Tab>("simple");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [status, setStatus] = useState<ClickerStatus>(DEFAULT_STATUS);
  const [appInfo, setAppInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
  } | null>(null);
  const [dropdownOverflowBottom, setDropdownOverflowBottom] = useState(0);
  const [simpleCurveOpen, setSimpleCurveOpen] = useState(false);

  const hotkeyTimer = useRef<number | null>(null);
  const hotkeyRequestIdRef = useRef(0);
  const uiSettingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const committedSettingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const lastValidHotkeyRef = useRef(DEFAULT_SETTINGS.hotkey);
  const launchWindowPlacementDone = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setUiSettings = (nextSettings: Settings) => {
    uiSettingsRef.current = nextSettings;
    setSettings(nextSettings);
  };

  const scheduleSave = (nextSettings: Settings) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveSettings(nextSettings).catch((err) => {
        console.error("Failed to save settings:", err);
      });
    }, 100);
  };

  const persistCommittedSettings = (
    nextCommittedSettings: Settings,
    nextUiSettings: Settings,
  ) => {
    committedSettingsRef.current = nextCommittedSettings;
    setUiSettings(nextUiSettings);

    if (!settingsLoaded) {
      return;
    }

    syncSettingsToBackend(nextCommittedSettings).catch((err) => {
      console.error("Failed to sync settings:", err);
    });
    scheduleSave(nextCommittedSettings);
  };

  const restoreLastValidHotkey = () => {
    const restoredHotkey = lastValidHotkeyRef.current;
    if (uiSettingsRef.current.hotkey === restoredHotkey) {
      return;
    }

    setUiSettings({
      ...uiSettingsRef.current,
      hotkey: restoredHotkey,
    });
  };

  const queueHotkeyRegistration = (hotkey: string) => {
    if (!settingsLoaded) {
      return;
    }

    if (hotkeyTimer.current !== null) {
      window.clearTimeout(hotkeyTimer.current);
    }

    const requestId = ++hotkeyRequestIdRef.current;
    hotkeyTimer.current = window.setTimeout(() => {
      hotkeyTimer.current = null;

      registerHotkeyCandidate(hotkey)
        .then((normalizedHotkey) => {
          if (hotkeyRequestIdRef.current !== requestId) {
            return;
          }

          lastValidHotkeyRef.current = normalizedHotkey;
          const nextCommittedSettings = {
            ...committedSettingsRef.current,
            hotkey: normalizedHotkey,
          };
          const nextUiSettings = {
            ...uiSettingsRef.current,
            hotkey: normalizedHotkey,
          };

          persistCommittedSettings(nextCommittedSettings, nextUiSettings);
        })
        .catch((err) => {
          if (hotkeyRequestIdRef.current !== requestId) {
            return;
          }

          console.error("Failed to register hotkey:", err);
          restoreLastValidHotkey();
        });
    }, 250);
  };

  const updateSettings = (
    patch: Partial<Settings>,
    options: UpdateSettingsOptions = {},
  ) => {
    const { hotkey, ...rest } = patch;
    const shouldClearActivePreset =
      !options.preserveActivePreset &&
      (hotkey !== undefined ||
        Object.keys(rest).some((key) => OPERATIONAL_SETTING_KEYS.has(key)));

    const restPatch: Partial<Settings> = { ...rest };
    if (
      shouldClearActivePreset &&
      patch.activePresetId === undefined &&
      committedSettingsRef.current.activePresetId !== null
    ) {
      restPatch.activePresetId = null;
    }

    if (Object.keys(restPatch).length > 0) {
      const nextUiSettings = { ...uiSettingsRef.current, ...restPatch };
      const nextCommittedSettings = {
        ...committedSettingsRef.current,
        ...restPatch,
      };
      persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    }

    if (hotkey !== undefined) {
      setUiSettings({
        ...uiSettingsRef.current,
        hotkey,
      });
      queueHotkeyRegistration(hotkey);
    }
  };

  const applyStartupWindowPlacement = async () => {
    await getCurrentWindow().center();
  };

  const handleWindowClose = async () => {
    if (uiSettingsRef.current.minimizeToTray) {
      await getCurrentWindow().hide();
    } else {
      await invoke("quit_app");
    }
  };

  const handleToggleAlwaysOnTop = async () => {
    const nextValue = !committedSettingsRef.current.alwaysOnTop;

    try {
      await getCurrentWindow().setAlwaysOnTop(nextValue);
      updateSettings(
        {
          alwaysOnTop: nextValue,
        },
        { preserveActivePreset: true },
      );
    } catch (err) {
      console.error("Failed to set always on top:", err);
    }
  };

  const handleSavePreset = (name: string) => {
    if (status.running) {
      return false;
    }

    if (committedSettingsRef.current.presets.length >= MAX_PRESETS) {
      return false;
    }

    const preset = createPresetDefinition(name, committedSettingsRef.current);
    if (!preset.name) {
      return false;
    }

    const nextPresets = [...committedSettingsRef.current.presets, preset];
    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
      activePresetId: preset.id,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
      activePresetId: preset.id,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  const handleApplyPreset = (presetId: PresetId) => {
    if (status.running) {
      return false;
    }

    const preset = committedSettingsRef.current.presets.find(
      (item) => item.id === presetId,
    );
    if (!preset) {
      return false;
    }

    updateSettings(
      {
        ...preset.settings,
        activePresetId: presetId,
      },
      { preserveActivePreset: true },
    );
    return true;
  };

  const handleUpdatePreset = (presetId: PresetId) => {
    if (status.running) {
      return false;
    }

    const nextSnapshot = buildPresetSnapshot(committedSettingsRef.current);

    let updated = false;
    const nextPresets = committedSettingsRef.current.presets.map((preset) => {
      if (preset.id !== presetId) {
        return preset;
      }

      updated = true;
      return {
        ...preset,
        updatedAt: new Date().toISOString(),
        settings: nextSnapshot,
      };
    });

    if (!updated) {
      return false;
    }

    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
      activePresetId: presetId,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
      activePresetId: presetId,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  const handleRenamePreset = (presetId: PresetId, name: string) => {
    if (status.running) {
      return false;
    }

    const sanitizedName = sanitizePresetName(name);
    if (!sanitizedName) {
      return false;
    }

    let updated = false;
    const nextPresets = committedSettingsRef.current.presets.map((preset) => {
      if (preset.id !== presetId) {
        return preset;
      }

      updated = true;
      return {
        ...preset,
        name: sanitizedName,
        updatedAt: new Date().toISOString(),
      };
    });

    if (!updated) {
      return false;
    }

    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  const handleDeletePreset = (presetId: PresetId) => {
    if (status.running) {
      return false;
    }

    const nextPresets = committedSettingsRef.current.presets.filter(
      (preset) => preset.id !== presetId,
    );
    if (nextPresets.length === committedSettingsRef.current.presets.length) {
      return false;
    }

    const nextActivePresetId =
      committedSettingsRef.current.activePresetId === presetId
        ? null
        : committedSettingsRef.current.activePresetId;

    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
      activePresetId: nextActivePresetId,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
      activePresetId: nextActivePresetId,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      loadSettings(),
      invoke<AppInfo>("get_app_info"),
      invoke<ClickerStatus>("get_status"),
    ])
      .then(async ([loadedSettings, loadedAppInfo, loadedStatus]) => {
        if (!mounted) return;

        let hydratedSettings = loadedSettings;

        let registeredHotkey = loadedSettings.hotkey;
        try {
          registeredHotkey = await registerHotkeyCandidate(
            loadedSettings.hotkey,
          );
        } catch (err) {
          console.error("Failed to register saved hotkey:", err);
          registeredHotkey = lastValidHotkeyRef.current;
        }

        if (registeredHotkey !== hydratedSettings.hotkey) {
          hydratedSettings = {
            ...hydratedSettings,
            hotkey: registeredHotkey,
          };
        }

        try {
          await getCurrentWindow().setAlwaysOnTop(hydratedSettings.alwaysOnTop);
        } catch (err) {
          console.error("Failed to restore always on top:", err);
          hydratedSettings = {
            ...hydratedSettings,
            alwaysOnTop: false,
          };
        }

        lastValidHotkeyRef.current = hydratedSettings.hotkey;
        uiSettingsRef.current = hydratedSettings;
        committedSettingsRef.current = hydratedSettings;

        setTab(hydratedSettings.lastPanel);
        setSettings(hydratedSettings);
        setAppInfo(loadedAppInfo);
        setStatus(loadedStatus);
        setSettingsLoaded(true);

        await syncSettingsToBackend(hydratedSettings);

        if (
          hydratedSettings.hotkey !== loadedSettings.hotkey ||
          hydratedSettings.alwaysOnTop !== loadedSettings.alwaysOnTop
        ) {
          await saveSettings(hydratedSettings);
        }
      })
      .catch((err) => {
        console.error("Failed to boot app:", err);
        if (!mounted) return;
        setSettingsLoaded(true);
      });

    return () => {
      mounted = false;
      if (hotkeyTimer.current !== null) {
        window.clearTimeout(hotkeyTimer.current);
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (resizeTimeout.current) {
        clearTimeout(resizeTimeout.current);
      }
    };
  }, []);

  const lastRunningRef = useRef(false);
  const hudEnabledRef = useRef(true);
  const soundEnabledRef = useRef(true);
  useEffect(() => {
    hudEnabledRef.current = settings.hudEnabled ?? true;
  }, [settings.hudEnabled]);
  useEffect(() => {
    soundEnabledRef.current = settings.soundEnabled ?? true;
  }, [settings.soundEnabled]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    listen<ClickerStatus>("clicker-status", (event) => {
      const next = event.payload;
      if (next.running !== lastRunningRef.current) {
        if (next.running) {
          if (soundEnabledRef.current) playStartSound();
          if (hudEnabledRef.current) {
            void invoke("set_hud_visible", { visible: true }).catch(() => {});
          }
        } else {
          if (soundEnabledRef.current) playStopSound();
          void invoke("set_hud_visible", { visible: false }).catch(() => {});
        }
        lastRunningRef.current = next.running;
      }
      setStatus(next);
    })
      .then((unlisten) => {
        cleanup = unlisten;
      })
      .catch((err) => {
        console.error("Failed to listen for clicker status:", err);
      });

    return () => {
      cleanup?.();
    };
  }, []);

  // Hide HUD if user disables it while running
  useEffect(() => {
    if (!status.running) return;
    void invoke("set_hud_visible", {
      visible: !!settings.hudEnabled,
    }).catch(() => {});
  }, [settings.hudEnabled, status.running]);

  // Window-profile auto-apply: poll foreground window every 1.5s,
  // apply matching preset if foreground title matches a profile rule.
  const handleApplyPresetRef = useRef(handleApplyPreset);
  useEffect(() => {
    handleApplyPresetRef.current = handleApplyPreset;
  });

  useEffect(() => {
    if (!settingsLoaded) return;
    const rules = settings.windowProfiles;
    if (!rules || rules.length === 0) return;
    if (status.running) return; // never switch presets mid-run

    let cancelled = false;
    const tick = async () => {
      try {
        const title = (
          await invoke<string>("get_foreground_window_title")
        ).toLowerCase();
        if (cancelled || !title) return;
        const matched = rules.find(
          (r) =>
            r.titlePattern && title.includes(r.titlePattern.toLowerCase()),
        );
        if (
          matched &&
          matched.presetId !== committedSettingsRef.current.activePresetId
        ) {
          handleApplyPresetRef.current(matched.presetId);
        }
      } catch {
        // ignore
      }
    };

    void tick();
    const interval = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    settingsLoaded,
    settings.windowProfiles,
    status.running,
  ]);

  useEffect(() => {
    const handleDropdownOverflow = (event: Event) => {
      const { active, bottom = 0 } = (event as CustomEvent<DropdownOverflowDetail>)
        .detail;
      const nextOverflow = active
        ? Math.min(Math.max(0, bottom), MAX_DROPDOWN_OVERFLOW_BOTTOM)
        : 0;

      setDropdownOverflowBottom(nextOverflow);
    };

    window.addEventListener("berserk-dropdown-overflow", handleDropdownOverflow);

    const handleSimpleCurveState = (event: Event) => {
      const detail = (event as CustomEvent<{ open: boolean }>).detail;
      setSimpleCurveOpen(!!detail?.open);
    };
    window.addEventListener("simple-curve-state", handleSimpleCurveState);

    return () => {
      window.removeEventListener(
        "berserk-dropdown-overflow",
        handleDropdownOverflow,
      );
      window.removeEventListener("simple-curve-state", handleSimpleCurveState);
    };
  }, []);

  useEffect(() => {
    if (resizeTimeout.current) {
      clearTimeout(resizeTimeout.current);
      resizeTimeout.current = null;
    }

    const root = document.querySelector(".app-root") as HTMLElement;

    void (async () => {
      try {
        const textScale = await invoke<number>("get_text_scale_factor");
        document.documentElement.style.fontSize = `${16 * textScale}px`;
        console.log("Windows Text Scale:", textScale);
        console.log(
          "Actual Root Font Size:",
          getComputedStyle(document.documentElement).fontSize,
        );

        const preferredSize = getPanelSize(tab, !!updateInfo, simpleCurveOpen);
        const { width, height } = await getClampedPanelSize(
          preferredSize,
          textScale,
        );
        const windowHeight = height + dropdownOverflowBottom;

        const appWindow = getCurrentWindow();

        if (!launchWindowPlacementDone.current) {
          await appWindow.setSize(new LogicalSize(width, windowHeight));

          root.style.width = `${width}px`;
          root.style.height = `${height}px`;

          await wait(30);
          await applyStartupWindowPlacement();
          launchWindowPlacementDone.current = true;
          return;
        }

        const currentSize = await appWindow.innerSize();
        const monitorScale = await appWindow.scaleFactor();
        const currentH = currentSize.height / monitorScale;
        const currentW = currentSize.width / monitorScale;

        if (width < currentW || windowHeight < currentH) {
          const snapW = width >= currentW ? width : currentW;
          const snapH = windowHeight >= currentH ? windowHeight : currentH;

          if (snapW !== currentW || snapH !== currentH) {
            await appWindow.setSize(new LogicalSize(snapW, snapH));
          }

          root.style.width = `${width}px`;
          root.style.height = `${height}px`;

          resizeTimeout.current = setTimeout(async () => {
            await appWindow.setSize(new LogicalSize(width, windowHeight));
            resizeTimeout.current = null;
          }, 320);
        } else {
          await appWindow.setSize(new LogicalSize(width, windowHeight));
          root.style.width = `${currentW}px`;
          root.style.height = `${currentH}px`;

          void root.offsetHeight;

          root.style.width = `${width}px`;
          root.style.height = `${height}px`;
        }
      } catch (err) {
        console.error("Failed to size window:", err);
      }
    })();
  }, [settings, settingsLoaded, tab, updateInfo, dropdownOverflowBottom, simpleCurveOpen]);

  useEffect(() => {
    const checkForUpdates = () => {
      invoke<{
        currentVersion: string;
        latestVersion: string;
        updateAvailable: boolean;
      }>("check_for_updates")
        .then((result) => {
          if (result?.updateAvailable) {
            setUpdateInfo({
              currentVersion: result.currentVersion,
              latestVersion: result.latestVersion,
            });
          }
        })
        .catch((err) => console.error("Update check failed:", err));
    };

    checkForUpdates();
    const interval = setInterval(checkForUpdates, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const theme = settings.theme ?? "dark";
    document.documentElement.dataset.theme = theme;
    applyAccentTheme(settings.accentColor, theme);
    applyThemePreset(settings.themePreset ?? "red");
  }, [settings.accentColor, settings.theme, settings.themePreset]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = isRtlLanguage(settings.language)
      ? "rtl"
      : "ltr";
  }, [settings.language]);

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);

    if (nextTab === "settings") return;
    if (committedSettingsRef.current.lastPanel === nextTab) return;

    updateSettings({
      lastPanel: nextTab,
    });
  };

  const handleResetSettings = async () => {
    try {
      if (hotkeyTimer.current !== null) {
        window.clearTimeout(hotkeyTimer.current);
        hotkeyTimer.current = null;
      }
      hotkeyRequestIdRef.current += 1;

      await invoke("reset_settings");
      await clearSavedSettings();
      await invoke("set_autostart_enabled", { enabled: false }).catch(() => {});
      await getCurrentWindow().setAlwaysOnTop(DEFAULT_SETTINGS.alwaysOnTop);

      lastValidHotkeyRef.current = DEFAULT_SETTINGS.hotkey;
      committedSettingsRef.current = DEFAULT_SETTINGS;
      uiSettingsRef.current = DEFAULT_SETTINGS;

      setSettings(DEFAULT_SETTINGS);
      setTab("simple");
      launchWindowPlacementDone.current = false;
    } catch (err) {
      console.error("Failed to reset settings:", err);
    }
  };

  return (
    <I18nProvider language={settings.language}>
      <div className="app-root" data-tab={tab} data-running={status.running}>
        <TitleBar
          running={status.running}
          stopReason={
            settings.showStopReason && (tab === "advanced" || tab === "zones")
              ? status.stopReason
              : null
          }
          isAlwaysOnTop={settings.alwaysOnTop}
          onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
          onRequestClose={handleWindowClose}
        />
        <Sidebar tab={tab} setTab={handleTabChange} />
        {updateInfo && (
          <UpdateBanner
            key={`${updateInfo.currentVersion}:${updateInfo.latestVersion}`}
            currentVersion={updateInfo.currentVersion}
            latestVersion={updateInfo.latestVersion}
          />
        )}
        <main className="panel-area">
          {tab === "simple" && (
            <SimplePanel settings={settings} update={updateSettings} />
          )}
          {tab === "advanced" && (
            <AdvancedPanel
              settings={settings}
              update={updateSettings}
              showInfo={true}
              running={status.running}
              activeSequenceIndex={status.activeSequenceIndex}
            />
          )}
          {tab === "zones" && (
            <ZonesPanel
              settings={settings}
              update={updateSettings}
              showInfo={true}
            />
          )}
          {tab === "settings" && (
            <SettingsPanel
              settings={settings}
              update={updateSettings}
              running={status.running}
              appInfo={appInfo}
              onSavePreset={handleSavePreset}
              onApplyPreset={handleApplyPreset}
              onUpdatePreset={handleUpdatePreset}
              onRenamePreset={handleRenamePreset}
              onDeletePreset={handleDeletePreset}
              onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
              onReset={handleResetSettings}
            />
          )}
        </main>
      </div>
    </I18nProvider>
  );
}
