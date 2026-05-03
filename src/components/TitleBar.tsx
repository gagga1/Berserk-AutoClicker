import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { translateStopReason, useTranslation } from "../i18n";
import "./TitleBar.css";

const appWindow = getCurrentWindow();

async function handleMinimize() {
  await appWindow.minimize();
}

interface Props {
  running: boolean;
  stopReason?: string | null;
  isAlwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => Promise<void>;
  onRequestClose: () => Promise<void>;
}

type TitleViewState = {
  text: string | null;
  flipClass: string;
  isReason: boolean;
};

const DEFAULT_TITLE_STATE: TitleViewState = {
  text: null,
  flipClass: "",
  isReason: false,
};

const BERSERK_BRAND = (
  <>
    <span className="brand-berserk">&#946;erserk</span>
    <span className="brand-tag">AUTOCLICKER</span>
  </>
);

export default function TitleBar({
  running,
  stopReason,
  isAlwaysOnTop,
  onToggleAlwaysOnTop,
  onRequestClose,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      className="window-title-background"
      style={
        {
          WebkitAppRegion: "drag",
          WebkitUserSelect: "none",
        } as CSSProperties
      }
      data-tauri-drag-region
      data-running={running}
    >
      <div className="title-left">
        <AnimatedTitle running={running} stopReason={stopReason} />
        <RunIndicator running={running} />
      </div>

      <div
        className="title-right"
        style={
          {
            WebkitAppRegion: "no-drag",
          } as CSSProperties
        }
      >
        <WindowBtn
          onClick={() => {
            void onToggleAlwaysOnTop();
          }}
          active={isAlwaysOnTop}
          title={
            isAlwaysOnTop
              ? t("titleBar.disableAlwaysOnTop")
              : t("titleBar.enableAlwaysOnTop")
          }
          label={
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 4h8l-1.4 5.2h-5.2L8 4z" />
              <path d="M6 9.2h12" />
              <path d="M12 9.2v10.8" />
            </svg>
          }
        />
        <WindowBtn
          onClick={() => {
            void handleMinimize();
          }}
          title={t("titleBar.minimize")}
          label={
            <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
              <rect width="10" height="2" fill="currentColor" />
            </svg>
          }
        />
        <WindowBtn
          onClick={() => {
            void onRequestClose();
          }}
          danger
          title={t("titleBar.close")}
          label={
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          }
        />
      </div>
    </div>
  );
}

function AnimatedTitle({
  running,
  stopReason,
}: Pick<Props, "running" | "stopReason">) {
  const [titleState, setTitleState] = useState(DEFAULT_TITLE_STATE);
  const frameIdsRef = useRef<number[]>([]);
  const timeoutIdsRef = useRef<number[]>([]);
  const { t } = useTranslation();

  const clearScheduledWork = () => {
    frameIdsRef.current.forEach((id) => window.cancelAnimationFrame(id));
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    frameIdsRef.current = [];
    timeoutIdsRef.current = [];
  };

  const queueFrame = (fn: () => void) => {
    const id = window.requestAnimationFrame(fn);
    frameIdsRef.current.push(id);
  };

  const queueDelay = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timeoutIdsRef.current.push(id);
  };

  useEffect(() => {
    clearScheduledWork();

    if (running || !stopReason) {
      queueFrame(() => {
        setTitleState(DEFAULT_TITLE_STATE);
      });
      return clearScheduledWork;
    }

    queueFrame(() => {
      setTitleState((current) => ({ ...current, flipClass: "flip-out" }));
      queueDelay(() => {
        setTitleState({
          text: translateStopReason(stopReason, t),
          isReason: true,
          flipClass: "",
        });

        queueFrame(() => {
          setTitleState((current) => ({ ...current, flipClass: "flip-in" }));
          queueDelay(() => {
            setTitleState((current) => ({ ...current, flipClass: "" }));
          }, 350);
        });

        queueDelay(() => {
          queueFrame(() => {
            setTitleState((current) => ({ ...current, flipClass: "flip-out" }));
            queueDelay(() => {
              setTitleState(DEFAULT_TITLE_STATE);
              queueFrame(() => {
                setTitleState((current) => ({ ...current, flipClass: "flip-in" }));
                queueDelay(() => {
                  setTitleState((current) => ({ ...current, flipClass: "" }));
                }, 350);
              });
            }, 350);
          });
        }, 5000);
      }, 400);
    });

    return clearScheduledWork;
  }, [running, stopReason, t]);

  return (
    <span
      className={`window-title title-flipper ${titleState.flipClass} ${titleState.isReason ? "is-reason" : ""}`}
    >
      {titleState.isReason ? titleState.text : BERSERK_BRAND}
    </span>
  );
}

function RunIndicator({ running }: { running: boolean }) {
  return (
    <span
      className={`run-indicator ${running ? "active" : ""}`}
      title={running ? "Running" : "Idle"}
      aria-label={running ? "Running" : "Idle"}
    >
      <span className="run-dot" />
      <span className="run-bars" aria-hidden="true">
        <span className="run-bar" />
        <span className="run-bar" />
        <span className="run-bar" />
        <span className="run-bar" />
        <span className="run-bar" />
      </span>
    </span>
  );
}

function WindowBtn({
  onClick,
  label,
  danger,
  active,
  title,
}: {
  onClick: () => void;
  label: ReactNode;
  danger?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`window-btn ${danger ? "window-btn-danger" : ""} ${active ? "active" : ""}`}
    >
      {label}
    </button>
  );
}
