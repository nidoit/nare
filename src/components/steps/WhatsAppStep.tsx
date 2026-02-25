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
      setError("봇 토큰을 입력해주세요");
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
        <h1>메신저 연결</h1>
        <p>NARE가 사용할 메신저를 선택하세요.</p>

        <div className="messenger-cards">
          <button className="messenger-card" onClick={chooseTelegram}>
            <div className="messenger-card-icon">✈️</div>
            <div className="messenger-card-info">
              <strong>Telegram</strong>
              <span className="messenger-card-badge recommended">추천</span>
            </div>
            <p>공식 Bot API — 안정적, 무료, 간편한 설정</p>
          </button>

          <button className="messenger-card" onClick={chooseWhatsApp}>
            <div className="messenger-card-icon">📱</div>
            <div className="messenger-card-info">
              <strong>WhatsApp</strong>
              <span className="messenger-card-badge">비공식</span>
            </div>
            <p>Baileys 사용 — QR 스캔 필요, 연결 끊길 수 있음</p>
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
        <h1>Telegram 봇 설정</h1>
        <div className="telegram-instructions">
          <ol>
            <li>
              Telegram에서 <strong>@BotFather</strong>에게 메시지를 보내세요
            </li>
            <li>
              <code>/newbot</code>을 보내고 안내를 따르세요
            </li>
            <li>봇 토큰을 복사해서 아래에 붙여넣기하세요</li>
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
            연결
          </button>
        </div>

        {error && (
          <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>
            {error}
          </p>
        )}

        <button className="btn btn-ghost" onClick={backToChoice} style={{ marginTop: 12 }}>
          ← 돌아가기
        </button>
      </div>
    );
  }

  // ── Starting ────────────────────────────────────────────────────────────

  if (state === "starting") {
    return (
      <div className="step">
        <div className="step-icon">{messenger === "telegram" ? "✈️" : "📱"}</div>
        <h1>{messenger === "telegram" ? "Telegram 연결 중..." : "WhatsApp 시작 중..."}</h1>
        <div className="step-actions">
          <span className="status-badge loading">
            <span className="spinner" style={{ width: 12, height: 12 }} />
            {messenger === "telegram" ? "봇 토큰 확인 중..." : "브릿지 시작 중..."}
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
        <h1>봇에게 /start를 보내세요</h1>
        {botUsername && (
          <p>
            Telegram에서 <strong>@{botUsername}</strong>에게 메시지를 보내세요
          </p>
        )}
        <div className="telegram-instructions">
          <ol>
            <li>핸드폰이나 PC에서 Telegram을 여세요</li>
            <li>봇을 찾으세요: <strong>@{botUsername || "your_bot"}</strong></li>
            <li><code>/start</code>를 보내서 연결하세요</li>
          </ol>
        </div>
        <div className="step-actions">
          <span className="status-badge waiting">/start 대기 중...</span>
        </div>
        <button className="btn btn-ghost" onClick={backToChoice} style={{ marginTop: 12 }}>
          ← 돌아가기
        </button>
      </div>
    );
  }

  // ── WhatsApp: QR code ───────────────────────────────────────────────────

  if (state === "qr" && qrDataUrl) {
    return (
      <div className="step">
        <div className="step-icon">📱</div>
        <h1>QR 코드 스캔</h1>
        <div className="qr-container">
          <img src={qrDataUrl} alt="WhatsApp QR Code" />
        </div>
        <div className="qr-instructions">
          <ol>
            <li>핸드폰에서 WhatsApp을 여세요</li>
            <li>메뉴(⋮) → 연결된 기기를 누르세요</li>
            <li>"기기 연결"을 누르세요</li>
            <li>위의 QR 코드에 카메라를 맞추세요</li>
          </ol>
        </div>
        <div className="step-actions">
          <span className="status-badge waiting">스캔 대기 중...</span>
        </div>
        <button className="btn btn-ghost" onClick={backToChoice} style={{ marginTop: 12 }}>
          ← 돌아가기
        </button>
      </div>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────

  if (state === "connected") {
    return (
      <div className="step">
        <div className="step-icon">{messenger === "telegram" ? "✈️" : "📱"}</div>
        <h1>{messenger === "telegram" ? "Telegram 연결 완료" : "WhatsApp 연결 완료"}</h1>
        <div className="step-actions">
          <span className="status-badge success">
            ✓ 연결됨{connectedId ? ` — ${messenger === "telegram" ? "Chat " : "+"}${connectedId}` : ""}
          </span>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────

  return (
    <div className="step">
      <div className="step-icon">⚠️</div>
      <h1>연결 오류</h1>
      <div className="step-actions">
        <p style={{ color: "var(--red)", fontSize: "12px" }}>{error}</p>
        <button className="btn btn-primary" onClick={backToChoice}>
          다시 시도
        </button>
      </div>
    </div>
  );
}
