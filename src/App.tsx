import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import SetupWizard from "./components/SetupWizard";
import { useI18n, Lang } from "./i18n";

interface SetupStatus {
  claude_configured: boolean;
  messenger_configured: boolean;
}

interface ConfigInfo {
  api_key_set: boolean;
  provider: string | null;
  messenger: string | null;
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SetupStatus>("check_setup_status").then(setStatus);
  }, []);

  useEffect(() => {
    if (showSettings) {
      invoke<ConfigInfo>("get_config_info").then(setConfig);
    }
  }, [showSettings]);

  async function handleResetSetup() {
    if (!confirm(t("app.resetConfirm"))) return;
    await invoke("reset_setup");
    setShowSettings(false);
    setStatus({ claude_configured: false, messenger_configured: false });
  }

  async function handleSaveApiKey() {
    const key = apiKey.trim();
    if (!key) {
      setApiKeyError(t("app.apiKeyRequired"));
      return;
    }
    if (!key.startsWith("sk-")) {
      setApiKeyError(t("app.apiKeyInvalidDs"));
      return;
    }
    try {
      await invoke("save_api_key", { provider: "deepseek", key });
      setApiKeySaved(true);
      setApiKeyError(null);
      setApiKey("");
      invoke<ConfigInfo>("get_config_info").then(setConfig);
      invoke<SetupStatus>("check_setup_status").then(setStatus);
    } catch (e) {
      setApiKeyError(String(e));
    }
  }

  if (!status) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }

  const setupComplete = status.claude_configured && status.messenger_configured;

  if (!setupComplete && !showSettings) {
    return (
      <SetupWizard
        initialClaudeConfigured={status.claude_configured}
        initialMessengerConfigured={status.messenger_configured}
      />
    );
  }

  // ── Settings view ──────────────────────────────────────────────
  if (showSettings) {
    return (
      <div className="app-settings">
        <div className="settings-header">
          <h2>{t("app.settings")}</h2>
          <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>
            {t("nav.goBack")}
          </button>
        </div>

        <div className="settings-section">
          <h3>{t("ai.title")}</h3>
          <div className="settings-row">
            <span className="settings-label">{t("app.provider")}</span>
            <span className={`status-badge ${config?.api_key_set ? "success" : "waiting"}`}>
              {config?.api_key_set
                ? `✓ ${config?.provider === "deepseek" ? "DeepSeek" : "Claude"}`
                : t("app.notSet")}
            </span>
          </div>
          {config?.provider === "deepseek" && (
            <>
              <div className="token-input-group" style={{ marginTop: 12 }}>
                <input
                  type="password"
                  className="token-input"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setApiKeySaved(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
                />
                <button className="btn btn-primary" onClick={handleSaveApiKey}>
                  {t("ai.save")}
                </button>
              </div>
              {apiKeySaved && (
                <p style={{ color: "var(--green)", fontSize: "12px", marginTop: 6 }}>
                  {t("app.apiKeySaved")}
                </p>
              )}
              {apiKeyError && (
                <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 6 }}>
                  {apiKeyError}
                </p>
              )}
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 8 }}>
                <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  platform.deepseek.com
                </a>
                {" "}{t("app.apiKeyGetFrom")}
              </p>
            </>
          )}
        </div>

        <div className="settings-section">
          <h3>{t("app.messengerLabel")}</h3>
          <div className="settings-row">
            <span className="settings-label">{t("app.connectionLabel")}</span>
            <span className={`status-badge ${config?.messenger ? "success" : "waiting"}`}>
              {config?.messenger === "telegram"
                ? "✓ Telegram"
                : t("app.notConnected")}
            </span>
          </div>
        </div>

        <div className="settings-section">
          <h3>{t("app.language")}</h3>
          <div className="settings-row">
            <span className="settings-label">{t("app.langLabel")}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              style={{
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 13,
              }}
            >
              <option value="en">English</option>
              <option value="ko">한국어</option>
              <option value="sv">Svenska</option>
            </select>
          </div>
        </div>

        <div className="settings-section settings-danger">
          <h3>{t("app.resetSection")}</h3>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: 12 }}>
            {t("app.resetDesc")}
          </p>
          <button className="btn btn-danger" onClick={handleResetSetup}>
            {t("app.resetSetup")}
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard (main view) ──────────────────────────────────────
  return (
    <div className="app-ready">
      <div className="ready-content">
        <div className="ready-icon">✅</div>
        <h2>{t("app.running")}</h2>
        <p>{t("app.runningDesc")}</p>
        <div className="dashboard-actions">
          <button className="btn btn-primary" onClick={() => setShowSettings(true)}>
            {t("app.settings")}
          </button>
          <button className="btn btn-ghost" onClick={handleResetSetup}>
            {t("app.resetSetup")}
          </button>
        </div>
      </div>
    </div>
  );
}
