import { invoke } from "@tauri-apps/api/core";

interface Props {
  claudeAuthed: boolean;
  waPhone: string | null;
}

export default function DoneStep({ claudeAuthed, waPhone }: Props) {
  async function startServices() {
    try {
      await invoke("start_services");
    } catch {
      // Services may already be running; ignore error
    }
    // Close the setup window — the main app will render the ready view
    window.location.reload();
  }

  return (
    <div className="step">
      <div className="step-icon">🎉</div>
      <h1>You're all set!</h1>
      <p>
        NARE is configured and ready. Send a WhatsApp message to start managing
        your system.
      </p>

      <div className="done-details">
        <div className="done-row">
          <span className="done-key">Claude</span>
          <span>{claudeAuthed ? "✅ Connected" : "⚠️ Not connected"}</span>
        </div>
        <div className="done-row">
          <span className="done-key">WhatsApp</span>
          <span>{waPhone ? `✅ +${waPhone}` : "⚠️ Not linked"}</span>
        </div>
        <div className="done-row">
          <span className="done-key">Config</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            ~/.config/nare/config.toml
          </span>
        </div>
      </div>

      <div className="step-actions">
        <button className="btn btn-primary" onClick={startServices}>
          Start NARE →
        </button>
        <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Try sending: "What's my disk usage?" on WhatsApp
        </p>
      </div>
    </div>
  );
}
