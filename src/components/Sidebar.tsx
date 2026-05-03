import { type CSSProperties, type ReactNode } from "react";
import type { Tab } from "../App";
import { useTranslation, type TranslationKey } from "../i18n";
import "./Sidebar.css";

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
}

type SbItem = {
  value: Tab;
  labelKey: TranslationKey;
  icon: ReactNode;
};

const TOP_ITEMS: readonly SbItem[] = [
  {
    value: "simple",
    labelKey: "titleBar.simple",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="3" width="10" height="18" rx="5" />
        <path d="M12 7v4" />
      </svg>
    ),
  },
  {
    value: "advanced",
    labelKey: "titleBar.advanced",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 5.5 18 9l-2 2-3.5-3.5L14.5 5.5z" />
        <path d="m12 7-7 7v4h4l7-7" />
        <path d="m9 14 1 1" />
      </svg>
    ),
  },
  {
    value: "zones",
    labelKey: "titleBar.zones",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9h6v6H9z" />
      </svg>
    ),
  },
] as const;

const SETTINGS_ITEM: SbItem = {
  value: "settings",
  labelKey: "titleBar.settings",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h-4l-1 3-3 1v4l3 1 1 3h4l1-3 3-1v-4l-3-1-1-3z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  ),
};

export default function Sidebar({ tab, setTab }: Props) {
  const { t } = useTranslation();

  const renderItem = (item: SbItem) => {
    const active = tab === item.value;
    return (
      <button
        key={item.value}
        className={`sb-btn ${active ? "active" : ""}`}
        onClick={() => setTab(item.value)}
        title={t(item.labelKey)}
        aria-label={t(item.labelKey)}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        {item.icon}
        <span className="sb-tooltip">{t(item.labelKey)}</span>
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sb-group">{TOP_ITEMS.map(renderItem)}</div>
      <div className="sb-spacer" />
      <div className="sb-group">{renderItem(SETTINGS_ITEM)}</div>
    </aside>
  );
}
