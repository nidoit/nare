import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Props {
  onConnected: (phone: string) => void;
}

type Library = "baileys" | "whatsapp-web-js";
type BridgeState = "idle" | "starting" | "qr" | "connected" | "error";

export default function WhatsAppStep({ onConnected }: Props) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [state, setState] = useState<BridgeState>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlistenQr = listen<string>("wa-qr", (event) => {
      setQrDataUrl(event.payload);
      setState("qr");
    });

    const unlistenAuth = listen<string>("wa-authenticated", (event) => {
      setPhone(event.payload);
      setState("connected");
      onConnected(event.payload);
    });

    return () => {
      unlistenQr.then((fn) => fn());
      unlistenAuth.then((fn) => fn());
    };
  }, [onConnected]);

  async function startBridge() {
    if (!library) return;
    setError(null);
    setState("starting");
    try {
      await invoke("start_wa_bridge", { library });
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  // Phase 1: Library selection
  if (!library) {
    return (
      <div className="step">
        <div className="step-icon">📱</div>
        <h1>Connect WhatsApp</h1>
        <p>Choose a WhatsApp library to connect your device.</p>

        <div className="library-cards">
          <button
            className="library-card"
            onClick={() => setLibrary("whatsapp-web-js")}
          >
            <div className="library-card-header">
              <span className="library-card-icon">💬</span>
              <span className="library-card-badge popular">Most Popular</span>
            </div>
            <h3>whatsapp-web.js</h3>
            <p>Full-featured WhatsApp Web API client with broad community support.</p>
            <span className="library-card-tag free">Free</span>
          </button>

          <button
            className="library-card"
            onClick={() => setLibrary("baileys")}
          >
            <div className="library-card-header">
              <span className="library-card-icon">⚡</span>
              <span className="library-card-badge lightweight">Lightweight</span>
            </div>
            <h3>Baileys</h3>
            <p>Lightweight WhatsApp Web socket client — no browser needed.</p>
            <span className="library-card-tag free">Free</span>
          </button>
        </div>
      </div>
    );
  }

  // Phase 2: Bridge connection
  return (
    <div className="step">
      <div className="step-icon">📱</div>
      <h1>Add Device</h1>
      <p>
        Using <strong>{library === "baileys" ? "Baileys" : "whatsapp-web.js"}</strong>
        {" — "}
        <button
          className="btn-link"
          onClick={() => { setLibrary(null); setState("idle"); setError(null); }}
        >
          change
        </button>
      </p>

      {state === "idle" && (
        <div className="step-actions">
          <button className="btn btn-primary" onClick={startBridge}>
            Start WhatsApp Setup
          </button>
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            A QR code will appear — scan it with your phone to link this device.
          </p>
        </div>
      )}

      {state === "starting" && (
        <div className="step-actions">
          <span className="status-badge loading">
            <span className="spinner" style={{ width: 12, height: 12 }} />
            Starting bridge…
          </span>
        </div>
      )}

      {state === "qr" && qrDataUrl && (
        <>
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
            <span className="status-badge waiting">Waiting for scan…</span>
          </div>
        </>
      )}

      {state === "connected" && phone && (
        <div className="step-actions">
          <span className="status-badge success">
            ✓ Connected — +{phone}
          </span>
        </div>
      )}

      {state === "error" && (
        <div className="step-actions">
          <p style={{ color: "var(--red)", fontSize: "12px" }}>{error}</p>
          <button className="btn btn-ghost" onClick={startBridge}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
