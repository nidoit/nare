import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../../i18n";

interface Props {
  onConnected: (id: string) => void;
}

type BridgeState =
  | "token-input"
  | "starting"
  | "waiting"
  | "connected"
  | "error";

export default function MessengerStep({ onConnected }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<BridgeState>("token-input");
  const [token, setToken] = useState("");
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unTgBotInfo = listen<string>("tg-bot-info", (e) => {
      setBotUsername(e.payload);
    });
    const unTgWaiting = listen("tg-waiting", () => {
      setState("waiting");
    });
    const unTgConnected = listen<string>("tg-connected", (e) => {
      setConnectedId(e.payload);
      setState("connected");
      onConnected(e.payload);
    });
    const unTgError = listen<string>("tg-error", (e) => {
      setError(e.payload);
      setState("error");
    });

    return () => {
      unTgBotInfo.then((fn) => fn());
      unTgWaiting.then((fn) => fn());
      unTgConnected.then((fn) => fn());
      unTgError.then((fn) => fn());
    };
  }, [onConnected]);

  async function startTelegram() {
    if (!token.trim()) {
      setError(t("msg.tokenRequired"));
      return;
    }
    setError(null);
    setState("starting");
    try {
      await invoke("start_telegram_bridge", { token: token.trim() });
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  function backToInput() {
    invoke("stop_bridge").catch(() => {});
    setState("token-input");
    setError(null);
    setBotUsername(null);
    setConnectedId(null);
  }

  // ── Token input ───────────────────────────────────────────────────────

  if (state === "token-input") {
    return (
      <div className="step">
        <div className="step-icon">✈️</div>
        <h1>{t("msg.setupTitle")}</h1>
        <div className="telegram-instructions">
          <ol>
            <li>
              {t("msg.step1")}
            </li>
            <li>
              {t("msg.step2")}
            </li>
            <li>{t("msg.step3")}</li>
          </ol>
        </div>

        <div className="token-input-group">
          <input
            type="text"
            className="token-input"
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startTelegram()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={startTelegram}>
            {t("msg.connect")}
          </button>
        </div>

        {error && (
          <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Starting ──────────────────────────────────────────────────────────

  if (state === "starting") {
    return (
      <div className="step">
        <div className="step-icon">✈️</div>
        <h1>{t("msg.connecting")}</h1>
        <div className="step-actions">
          <span className="status-badge loading">
            <span className="spinner" style={{ width: 12, height: 12 }} />
            {t("msg.verifying")}
          </span>
        </div>
      </div>
    );
  }

  // ── Waiting for /start ────────────────────────────────────────────────

  if (state === "waiting") {
    return (
      <div className="step">
        <div className="step-icon">✈️</div>
        <h1>{t("msg.sendStart")}</h1>
        {botUsername && (
          <p>
            <strong>@{botUsername}</strong> {t("msg.sendStartDesc")}
          </p>
        )}
        <div className="telegram-instructions">
          <ol>
            <li>{t("msg.openTelegram")}</li>
            <li>{t("msg.findBot")} <strong>@{botUsername || "your_bot"}</strong></li>
            <li>{t("msg.sendStartCmd")}</li>
          </ol>
        </div>
        <div className="step-actions">
          <span className="status-badge waiting">{t("msg.waitingStart")}</span>
        </div>
        <button className="btn btn-ghost" onClick={backToInput} style={{ marginTop: 12 }}>
          {t("nav.goBack")}
        </button>
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────

  if (state === "connected") {
    return (
      <div className="step">
        <div className="step-icon">✈️</div>
        <h1>{t("msg.connected")}</h1>
        <div className="step-actions">
          <span className="status-badge success">
            {t("msg.connectedBadge")}{connectedId ? ` — Chat ${connectedId}` : ""}
          </span>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────

  return (
    <div className="step">
      <div className="step-icon">⚠️</div>
      <h1>{t("msg.error")}</h1>
      <div className="step-actions">
        <p style={{ color: "var(--red)", fontSize: "12px" }}>{error}</p>
        <button className="btn btn-primary" onClick={backToInput}>
          {t("msg.retry")}
        </button>
      </div>
    </div>
  );
}
