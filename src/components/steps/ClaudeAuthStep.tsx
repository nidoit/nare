import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  authed: boolean;
  onAuthed: () => void;
}

export default function ClaudeAuthStep({ authed, onAuthed }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSaveKey() {
    const key = apiKey.trim();
    if (!key) {
      setError("Please enter your API key");
      return;
    }
    if (!key.startsWith("sk-ant-")) {
      setError("Invalid key format. Anthropic API keys start with 'sk-ant-'");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await invoke("save_api_key", { key });
      onAuthed();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="step">
      <div className="step-icon">🔑</div>
      <h1>Anthropic API Key</h1>
      <p>
        NARE uses the Claude API to understand your messages and manage your system.
      </p>

      <div className="auth-state">
        {authed ? (
          <span className="status-badge success">✓ API key configured</span>
        ) : (
          <>
            <div className="telegram-instructions">
              <ol>
                <li>
                  Go to{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    console.anthropic.com/settings/keys
                  </a>
                </li>
                <li>Create a new API key</li>
                <li>Paste it below</li>
              </ol>
            </div>

            <div className="token-input-group" style={{ marginTop: 16 }}>
              <input
                type="password"
                className="token-input"
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={handleSaveKey}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>

            {error && (
              <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>
                {error}
              </p>
            )}

            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 12 }}>
              Your key is stored locally at ~/.config/nare/credentials/claude (chmod 600).
              It never leaves your machine except to call the Anthropic API.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
