import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../../i18n";

type SetupView = "select" | "claude" | "deepseek";

interface Props {
  onAuthed: () => void;
}

export default function ClaudeAuthStep({ onAuthed }: Props) {
  const { t } = useI18n();
  const [view, setView] = useState<SetupView>("select");
  const [claudeOk, setClaudeOk] = useState(false);
  const [deepseekOk, setDeepseekOk] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [claudeLoggingIn, setClaudeLoggingIn] = useState(false);

  // Check which providers are already configured
  useEffect(() => {
    invoke<{ claude_configured: boolean; deepseek_configured: boolean }>("get_config_info")
      .then((info) => {
        setClaudeOk(info.claude_configured);
        setDeepseekOk(info.deepseek_configured);
      })
      .catch(() => {});
  }, []);

  // Listen for Claude OAuth success event
  useEffect(() => {
    const unlisten = listen("claude-auth-success", () => {
      setClaudeLoggingIn(false);
      setClaudeOk(true);
      // Set as active provider (first configured wins, or if deepseek already set keep it)
      if (!deepseekOk) {
        invoke("save_provider_choice", { provider: "claude" }).catch(() => {});
      }
      setView("select");
      onAuthed();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [onAuthed, deepseekOk]);

  function validateKey(key: string): string | null {
    if (!key) return t("ai.keyRequired");
    if (!key.startsWith("sk-")) return t("ai.keyInvalidDs");
    return null;
  }

  async function handleSaveKey() {
    const key = apiKey.trim();
    const err = validateKey(key);
    if (err) { setError(err); return; }

    setError(null);
    setLoading(true);
    try {
      await invoke("save_api_key", { provider: "deepseek", key });
      setDeepseekOk(true);
      // Set as active provider if claude not configured yet
      if (!claudeOk) {
        await invoke("save_provider_choice", { provider: "deepseek" });
      }
      setView("select");
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

  // ── Claude setup view ───────────────────────────────────────────
  if (view === "claude") {
    return (
      <div className="step">
        <div className="step-icon">🧠</div>
        <h1>{t("ai.claudeLoginTitle")}</h1>
        <p>{t("ai.claudeLoginDesc")}</p>

        <div className="auth-state">
          {claudeOk ? (
            <span className="status-badge success">{t("ai.claudeLoggedIn")}</span>
          ) : claudeLoggingIn ? (
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
            <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>{error}</p>
          )}

          <button
            className="btn btn-ghost"
            onClick={() => { setView("select"); setError(null); }}
            style={{ marginTop: 8 }}
          >
            {t("ai.backToSelect")}
          </button>
        </div>
      </div>
    );
  }

  // ── DeepSeek setup view ─────────────────────────────────────────
  if (view === "deepseek") {
    return (
      <div className="step">
        <div className="step-icon">🔮</div>
        <h1>{t("ai.deepseekTitle")}</h1>
        <p>{t("ai.deepseekInputDesc")}</p>

        <div className="auth-state">
          {deepseekOk ? (
            <span className="status-badge success">{t("ai.keyConfigured")}</span>
          ) : (
            <>
              <div className="telegram-instructions">
                <ol>
                  <li>
                    <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
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
                <button className="btn btn-primary" onClick={handleSaveKey} disabled={loading}>
                  {loading ? t("ai.saving") : t("ai.save")}
                </button>
              </div>
            </>
          )}

          {error && (
            <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>{error}</p>
          )}

          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 12 }}>
            {t("ai.credNote")}
          </p>

          <button
            className="btn btn-ghost"
            onClick={() => { setView("select"); setError(null); setApiKey(""); }}
            style={{ marginTop: 8 }}
          >
            {t("ai.backToSelect")}
          </button>
        </div>
      </div>
    );
  }

  // ── Provider selection (main view) ──────────────────────────────
  return (
    <div className="step">
      <div className="step-icon">🤖</div>
      <h1>{t("ai.selectTitle")}</h1>
      <p>{t("ai.selectDesc")}</p>
      <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>{t("ai.bothHint")}</p>

      <div className="messenger-cards">
        <button className="messenger-card" onClick={() => setView("claude")}>
          <div className="messenger-card-icon">🧠</div>
          <div className="messenger-card-info">
            <strong>Claude</strong>
            {claudeOk ? (
              <span className="messenger-card-badge recommended">{t("ai.keyConfigured")}</span>
            ) : (
              <span className="messenger-card-badge">{t("ai.claudeProMax")}</span>
            )}
          </div>
          <p>{claudeOk ? t("ai.tapToReconfigure") : t("ai.claudeDesc")}</p>
        </button>

        <button className="messenger-card" onClick={() => setView("deepseek")}>
          <div className="messenger-card-icon">🔮</div>
          <div className="messenger-card-info">
            <strong>DeepSeek</strong>
            {deepseekOk ? (
              <span className="messenger-card-badge recommended">{t("ai.keyConfigured")}</span>
            ) : (
              <span className="messenger-card-badge">{t("ai.cheapBadge")}</span>
            )}
          </div>
          <p>{deepseekOk ? t("ai.tapToReconfigure") : t("ai.deepseekDesc")}</p>
        </button>
      </div>
    </div>
  );
}
