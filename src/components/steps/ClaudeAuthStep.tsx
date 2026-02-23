import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Props {
  authed: boolean;
  onAuthed: () => void;
}

export default function ClaudeAuthStep({ authed, onAuthed }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for the event emitted by Tauri when login is detected
  useEffect(() => {
    const unlisten = listen("claude-auth-success", () => {
      setLoading(false);
      onAuthed();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onAuthed]);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await invoke("open_claude_login");
      // Loading stays true until the event fires or the window is closed
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  return (
    <div className="step">
      <div className="step-icon">🔑</div>
      <h1>Sign in with Claude</h1>
      <p>
        NARE uses your Claude Pro or Max subscription — no API key needed.
        <br />A login window will open inside the app.
      </p>

      <div className="auth-state">
        {authed ? (
          <span className="status-badge success">✓ Signed in to Claude</span>
        ) : loading ? (
          <span className="status-badge loading">
            <span className="spinner" style={{ width: 12, height: 12 }} />
            Waiting for login…
          </span>
        ) : (
          <span className="status-badge waiting">Not signed in</span>
        )}

        {!authed && (
          <button
            className="btn btn-primary"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Opening…" : "Sign in with Claude"}
          </button>
        )}

        {error && (
          <p style={{ color: "var(--red)", fontSize: "12px" }}>{error}</p>
        )}

        {!authed && (
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Requires a{" "}
            <a
              href="https://claude.ai"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)" }}
            >
              Claude Pro or Max
            </a>{" "}
            subscription.
          </p>
        )}
      </div>
    </div>
  );
}
