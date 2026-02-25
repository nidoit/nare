import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../../i18n";

type Provider = null | "claude" | "deepseek";

interface Props {
  authed: boolean;
  onAuthed: () => void;
}

export default function ClaudeAuthStep({ authed, onAuthed }: Props) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<Provider>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [claudeLoggingIn, setClaudeLoggingIn] = useState(false);

  // Listen for Claude OAuth success event
  useEffect(() => {
    const unlisten = listen("claude-auth-success", () => {
      setClaudeLoggingIn(false);
      // Store provider preference
      invoke("save_provider_choice", { provider: "claude" }).catch(() => {});
      onAuthed();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [onAuthed]);

  function validateKey(key: string): string | null {
    if (!key) return t("ai.keyRequired");
    if (!key.startsWith("sk-")) {
      return t("ai.keyInvalidDs");
    }
    return null;
  }

  async function handleSaveKey() {
    const key = apiKey.trim();
    const err = validateKey(key);
    if (err) {
      setError(err);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await invoke("save_api_key", { provider: "deepseek", key });
      onAuthed();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleClaudeLogin() {
    setClaudeLoggingIn(true);
    setError(null);
    try {
      await invoke("open_claude_login");
    } catch (e) {
      setError(String(e));
      setClaudeLoggingIn(false);
    }
  }

  if (authed) {
    return (
      <div className="step">
        <div className="step-icon">🔑</div>
        <h1>{t("ai.title")}</h1>
        <div className="auth-state">
          <span className="status-badge success">{t("ai.keyConfigured")}</span>
        </div>
      </div>
    );
  }

  // ── Provider selection ──────────────────────────────────────────────

  if (!provider) {
    return (
      <div className="step">
        <div className="step-icon">🤖</div>
        <h1>{t("ai.selectTitle")}</h1>
        <p>{t("ai.selectDesc")}</p>

        <div className="messenger-cards">
          <button className="messenger-card" onClick={() => setProvider("claude")}>
            <div className="messenger-card-icon">🧠</div>
            <div className="messenger-card-info">
              <strong>Claude</strong>
              <span className="messenger-card-badge">{t("ai.claudeProMax")}</span>
            </div>
            <p>{t("ai.claudeDesc")}</p>
          </button>

          <button className="messenger-card" onClick={() => setProvider("deepseek")}>
            <div className="messenger-card-icon">🔮</div>
            <div className="messenger-card-info">
              <strong>DeepSeek</strong>
              <span className="messenger-card-badge recommended">{t("ai.cheapBadge")}</span>
            </div>
            <p>{t("ai.deepseekDesc")}</p>
          </button>
        </div>
      </div>
    );
  }

  // ── Claude: OAuth web login ─────────────────────────────────────────

  if (provider === "claude") {
    return (
      <div className="step">
        <div className="step-icon">🧠</div>
        <h1>{t("ai.claudeLoginTitle")}</h1>
        <p>{t("ai.claudeLoginDesc")}</p>

        <div className="auth-state">
          {claudeLoggingIn ? (
            <span className="status-badge loading">
              <span className="spinner" style={{ width: 12, height: 12 }} />
              {t("ai.claudeLoginWait")}
            </span>
          ) : (
            <button className="btn btn-primary" onClick={handleClaudeLogin}>
              {t("ai.claudeLoginBtn")}
            </button>
          )}

          {error && (
            <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>
              {error}
            </p>
          )}

          <button
            className="btn btn-ghost"
            onClick={() => { setProvider(null); setError(null); }}
            style={{ marginTop: 8 }}
          >
            {t("ai.backToSelect")}
          </button>
        </div>
      </div>
    );
  }

  // ── DeepSeek: API key input ─────────────────────────────────────────

  return (
    <div className="step">
      <div className="step-icon">🔮</div>
      <h1>{t("ai.deepseekTitle")}</h1>
      <p>{t("ai.deepseekInputDesc")}</p>

      <div className="auth-state">
        <div className="telegram-instructions">
          <ol>
            <li>
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)" }}
              >
                platform.deepseek.com/api_keys
              </a>
              {" "}{t("ai.deepseekStep1")}
            </li>
            <li>{t("ai.deepseekStep2")}</li>
            <li>{t("ai.deepseekStep3")}</li>
          </ol>
        </div>

        <div className="token-input-group" style={{ marginTop: 16 }}>
          <input
            type="password"
            className="token-input"
            placeholder="sk-..."
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
            {loading ? t("ai.saving") : t("ai.save")}
          </button>
        </div>

        {error && (
          <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>
            {error}
          </p>
        )}

        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 12 }}>
          {t("ai.credNote")}
        </p>

        <button
          className="btn btn-ghost"
          onClick={() => { setProvider(null); setError(null); setApiKey(""); }}
          style={{ marginTop: 8 }}
        >
          {t("ai.backToSelect")}
        </button>
      </div>
    </div>
  );
}
