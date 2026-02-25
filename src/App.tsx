import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import SetupWizard from "./components/SetupWizard";

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
    if (!confirm("설정을 초기화하고 설정 마법사를 다시 시작할까요?")) return;
    await invoke("reset_setup");
    setShowSettings(false);
    setStatus({ claude_configured: false, messenger_configured: false });
  }

  async function handleSaveApiKey(provider: string) {
    const key = apiKey.trim();
    if (!key) {
      setApiKeyError("API 키를 입력해주세요");
      return;
    }
    if (provider === "claude" && !key.startsWith("sk-ant-")) {
      setApiKeyError("올바르지 않은 형식입니다. Anthropic API 키는 'sk-ant-'로 시작합니다");
      return;
    }
    if (provider === "deepseek" && !key.startsWith("sk-")) {
      setApiKeyError("올바르지 않은 형식입니다. DeepSeek API 키는 'sk-'로 시작합니다");
      return;
    }
    try {
      await invoke("save_api_key", { provider, key });
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
          <h2>설정</h2>
          <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>
            ← 돌아가기
          </button>
        </div>

        <div className="settings-section">
          <h3>AI 제공자</h3>
          <div className="settings-row">
            <span className="settings-label">제공자:</span>
            <span className={`status-badge ${config?.api_key_set ? "success" : "waiting"}`}>
              {config?.api_key_set
                ? `✓ ${config?.provider === "deepseek" ? "DeepSeek" : "Claude"}`
                : "설정 안됨"}
            </span>
          </div>
          <div className="token-input-group" style={{ marginTop: 12 }}>
            <input
              type="password"
              className="token-input"
              placeholder={config?.provider === "deepseek" ? "sk-..." : "sk-ant-api03-..."}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setApiKeySaved(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey(config?.provider || "claude")}
            />
            <button className="btn btn-primary" onClick={() => handleSaveApiKey(config?.provider || "claude")}>
              저장
            </button>
          </div>
          {apiKeySaved && (
            <p style={{ color: "var(--green)", fontSize: "12px", marginTop: 6 }}>
              ✓ API 키가 저장되었습니다
            </p>
          )}
          {apiKeyError && (
            <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 6 }}>
              {apiKeyError}
            </p>
          )}
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 8 }}>
            {config?.provider === "deepseek" ? (
              <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                platform.deepseek.com
              </a>
            ) : (
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                console.anthropic.com
              </a>
            )}
            에서 API 키를 발급받을 수 있습니다
          </p>
        </div>

        <div className="settings-section">
          <h3>메신저</h3>
          <div className="settings-row">
            <span className="settings-label">연결:</span>
            <span className={`status-badge ${config?.messenger ? "success" : "waiting"}`}>
              {config?.messenger === "telegram"
                ? "✓ Telegram"
                : config?.messenger === "whatsapp"
                ? "✓ WhatsApp"
                : "연결 안됨"}
            </span>
          </div>
        </div>

        <div className="settings-section settings-danger">
          <h3>초기화</h3>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: 12 }}>
            모든 설정을 삭제하고 설정 마법사를 다시 시작합니다.
          </p>
          <button className="btn btn-danger" onClick={handleResetSetup}>
            설정 초기화
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
        <h2>NARE 실행 중</h2>
        <p>
          시스템이 연결되었습니다. 메신저로 메시지를 보내서 Linux 시스템을 관리하세요.
        </p>
        <div className="dashboard-actions">
          <button className="btn btn-primary" onClick={() => setShowSettings(true)}>
            설정
          </button>
          <button className="btn btn-ghost" onClick={handleResetSetup}>
            설정 초기화
          </button>
        </div>
      </div>
    </div>
  );
}
