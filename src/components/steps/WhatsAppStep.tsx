import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Props {
  onConnected: (phone: string) => void;
}

type BridgeState = "idle" | "starting" | "qr" | "connected" | "error";

export default function WhatsAppStep({ onConnected }: Props) {
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
    setError(null);
    setState("starting");
    try {
      await invoke("start_wa_bridge");
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  return (
    <div className="step">
      <div className="step-icon">📱</div>
      <h1>Connect WhatsApp</h1>
      <p>Link your WhatsApp so NARE can receive and send messages.</p>

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
