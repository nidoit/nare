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
      setError("API 키를 입력해주세요");
      return;
    }
    if (!key.startsWith("sk-ant-")) {
      setError("올바르지 않은 형식입니다. Anthropic API 키는 'sk-ant-'로 시작합니다");
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
      <h1>Anthropic API 키</h1>
      <p>
        NARE는 Claude API를 사용하여 메시지를 이해하고 시스템을 관리합니다.
      </p>

      <div className="auth-state">
        {authed ? (
          <span className="status-badge success">✓ API 키 설정됨</span>
        ) : (
          <>
            <div className="telegram-instructions">
              <ol>
                <li>
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    console.anthropic.com/settings/keys
                  </a>
                  에 접속하세요
                </li>
                <li>새 API 키를 생성하세요</li>
                <li>아래에 붙여넣기하세요</li>
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
                {loading ? "저장 중..." : "저장"}
              </button>
            </div>

            {error && (
              <p style={{ color: "var(--red)", fontSize: "12px", marginTop: 8 }}>
                {error}
              </p>
            )}

            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 12 }}>
              키는 ~/.config/nare/credentials/claude에 로컬 저장됩니다 (chmod 600).
              Anthropic API 호출 외에는 외부로 전송되지 않습니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
