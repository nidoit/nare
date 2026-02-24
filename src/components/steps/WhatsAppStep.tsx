import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Props {
  onConnected: (id: string) => void;
}

type Messenger = null | "telegram" | "whatsapp";
type BridgeState =
  | "choose"
  | "token-input"
  | "starting"
  | "waiting"
  | "qr"
  | "connected"
  | "error";

export default function WhatsAppStep({ onConnected }: Props) {
  const [messenger, setMessenger] = useState<Messenger>(null);
  const [state, setState] = useState<BridgeState>("choose");
  const [token, setToken] = useState("");
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Telegram events
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

    // WhatsApp events
    const unWaQr = listen<string>("wa-qr", (e) => {
      setQrDataUrl(e.payload);
      setState("qr");
    });
    const unWaAuth = listen<string>("wa-authenticated", (e) => {
      setConnectedId(e.payload);
      setState("connected");
      onConnected(e.payload);
    });

    return () => {
      unTgBotInfo.then((fn) => fn());
      unTgWaiting.then((fn) => fn());
      unTgConnected.then((fn) => fn());
      unTgError.then((fn) => fn());
      unWaQr.then((fn) => fn());
      unWaAuth.then((fn) => fn());
    };
  }, [onConnected]);

  function chooseTelegram() {
    setMessenger("telegram");
    setState("token-input");
    setError(null);
  }

  function chooseWhatsApp() {
    setMessenger("whatsapp");
    startWhatsApp();
  }

  async function startTelegram() {
    if (!token.trim()) {
      setError("Please enter a bot token");
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

  async function startWhatsApp() {
    setError(null);
    setState("starting");
    try {
      await invoke("start_wa_bridge");
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  function backToChoice() {
    invoke("stop_bridge").catch(() => {});
    setMessenger(null);
    setState("choose");
    setError(null);
    setBotUsername(null);
    setQrDataUrl(null);
    setConnectedId(null);
  }

  // ── Choose messenger ────────────────────────────────────────────────────

  if (state === "choose") {
    return (
      <div className="step">
        <div className="step-icon">💬</div>
        <h1>Connect Messenger</h1>
        <p>Choose how NARE communicates with you.</p>

        <div className="messenger-cards">
          <button className="messenger-card" onClick={chooseTelegram}>
            <div className="messenger-card-icon">✈️</div>
            <div className="messenger-card-info">
              <strong>Telegram</strong>
              <span className="messenger-card-badge recommended">Recommended</span>
            </div>
            <p>Official Bot API — reliable, free, easy setup</p>
          </button>

          <button className="messenger-card" onClick={chooseWhatsApp}>
            <div className="messenger-card-icon">📱</div>
            <div className="messenger-card-info">
              <strong>WhatsApp</strong>
              <span className="messenger-card-badge">Unofficial</span>
            </div>
            <p>Via Baileys — requires QR scan, may disconnect</p>
          </button>
        </div>
      </div>
    );
  }

  // ── Telegram: token input ───────────────────────────────────────────────

  if (state === "token-input" && messenger === "telegram") {
    return (
      <div className="step">
        <div className="step-icon">✈️</div>
        <h1>Telegram Bot Setup</h1>
        <div className="telegram-instructions">
          <ol>
            <li>
              Open Telegram and message{" "}
              <strong>@BotFather</strong>
            </li>
            <li>
              Send <code>/newbot</code> and follow the prompts
            </li>
            <li>Copy the bot token and paste it below</li>
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
            Connect
          </button>
        </div>

        {error && (
          <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>
            {error}
          </p>
        )}

        <button className="btn btn-ghost" onClick={backToChoice} style={{ marginTop: 12 }}>
          ← Back
        </button>
      </div>
    );
  }

  // ── Starting ────────────────────────────────────────────────────────────

  if (state === "starting") {
    return (
      <div className="step">
        <div className="step-icon">{messenger === "telegram" ? "✈️" : "📱"}</div>
        <h1>{messenger === "telegram" ? "Connecting to Telegram..." : "Starting WhatsApp..."}</h1>
        <div className="step-actions">
          <span className="status-badge loading">
            <span className="spinner" style={{ width: 12, height: 12 }} />
            {messenger === "telegram" ? "Validating bot token..." : "Starting bridge..."}
          </span>
        </div>
      </div>
    );
  }

  // ── Telegram: waiting for /start ────────────────────────────────────────

  if (state === "waiting" && messenger === "telegram") {
    return (
      <div className="step">
        <div className="step-icon">✈️</div>
        <h1>Send /start to your bot</h1>
        {botUsername && (
          <p>
            Open Telegram and message{" "}
            <strong>@{botUsername}</strong>
          </p>
        )}
        <div className="telegram-instructions">
          <ol>
            <li>Open Telegram on your phone or desktop</li>
            <li>Find your bot: <strong>@{botUsername || "your_bot"}</strong></li>
            <li>Send <code>/start</code> to connect</li>
          </ol>
        </div>
        <div className="step-actions">
          <span className="status-badge waiting">Waiting for /start...</span>
        </div>
        <button className="btn btn-ghost" onClick={backToChoice} style={{ marginTop: 12 }}>
          ← Back
        </button>
      </div>
    );
  }

  // ── WhatsApp: QR code ───────────────────────────────────────────────────

  if (state === "qr" && qrDataUrl) {
    return (
      <div className="step">
        <div className="step-icon">📱</div>
        <h1>Scan QR Code</h1>
        <div className="qr-container">
          <img src={qrDataUrl} alt="WhatsApp QR Code" />
        </div>
        <div className="qr-instructions">
          <ol>
            <li>Open WhatsApp on your phone</li>
            <li>Tap Menu (⋮) → Linked Devices</li>
            <li>Tap "Link a Device"</li>
            <li>Point your camera at the QR code above</li>
          </ol>
        </div>
        <div className="step-actions">
          <span className="status-badge waiting">Waiting for scan...</span>
        </div>
        <button className="btn btn-ghost" onClick={backToChoice} style={{ marginTop: 12 }}>
          ← Back
        </button>
      </div>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────

  if (state === "connected") {
    return (
      <div className="step">
        <div className="step-icon">{messenger === "telegram" ? "✈️" : "📱"}</div>
        <h1>{messenger === "telegram" ? "Telegram Connected" : "WhatsApp Connected"}</h1>
        <div className="step-actions">
          <span className="status-badge success">
            ✓ Connected{connectedId ? ` — ${messenger === "telegram" ? "Chat " : "+"}${connectedId}` : ""}
          </span>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────

  return (
    <div className="step">
      <div className="step-icon">⚠️</div>
      <h1>Connection Error</h1>
      <div className="step-actions">
        <p style={{ color: "var(--red)", fontSize: "12px" }}>{error}</p>
        <button className="btn btn-primary" onClick={backToChoice}>
          Try Again
        </button>
      </div>
    </div>
  );
}
