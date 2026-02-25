import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Provider = null | "claude" | "deepseek";

interface Props {
  authed: boolean;
  onAuthed: () => void;
}

export default function ClaudeAuthStep({ authed, onAuthed }: Props) {
  const [provider, setProvider] = useState<Provider>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validateKey(key: string, prov: Provider): string | null {
    if (!key) return "API 키를 입력해주세요";
    if (prov === "claude" && !key.startsWith("sk-ant-")) {
      return "올바르지 않은 형식입니다. Anthropic API 키는 'sk-ant-'로 시작합니다";
    }
    if (prov === "deepseek" && !key.startsWith("sk-")) {
      return "올바르지 않은 형식입니다. DeepSeek API 키는 'sk-'로 시작합니다";
    }
    return null;
  }

  async function handleSaveKey() {
    const key = apiKey.trim();
    const err = validateKey(key, provider);
    if (err) {
      setError(err);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await invoke("save_api_key", { provider, key });
      onAuthed();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (authed) {
    return (
      <div className="step">
        <div className="step-icon">🔑</div>
        <h1>AI 제공자</h1>
        <div className="auth-state">
          <span className="status-badge success">✓ API 키 설정됨</span>
        </div>
      </div>
    );
  }

  // ── Provider selection ──────────────────────────────────────────────

  if (!provider) {
    return (
      <div className="step">
        <div className="step-icon">🤖</div>
        <h1>AI 제공자 선택</h1>
        <p>NARE가 사용할 AI를 선택하세요.</p>

        <div className="messenger-cards">
          <button className="messenger-card" onClick={() => setProvider("claude")}>
            <div className="messenger-card-icon">🧠</div>
            <div className="messenger-card-info">
              <strong>Claude</strong>
              <span className="messenger-card-badge">Pro/Max</span>
            </div>
            <p>Anthropic — 최고 성능, 유료 API 키 필요</p>
          </button>

          <button className="messenger-card" onClick={() => setProvider("deepseek")}>
            <div className="messenger-card-icon">🔮</div>
            <div className="messenger-card-info">
              <strong>DeepSeek</strong>
              <span className="messenger-card-badge recommended">저렴</span>
            </div>
            <p>DeepSeek — 우수한 성능, 저렴한 가격</p>
          </button>
        </div>
      </div>
    );
  }

  // ── API key input ───────────────────────────────────────────────────

  const isClaude = provider === "claude";

  return (
    <div className="step">
      <div className="step-icon">{isClaude ? "🧠" : "🔮"}</div>
      <h1>{isClaude ? "Anthropic API 키" : "DeepSeek API 키"}</h1>
      <p>
        {isClaude
          ? "Claude Pro/Max 전용 — Anthropic API 키가 필요합니다."
          : "DeepSeek API 키를 입력하세요."}
      </p>

      <div className="auth-state">
        <div className="telegram-instructions">
          <ol>
            {isClaude ? (
              <>
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
              </>
            ) : (
              <>
                <li>
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    platform.deepseek.com/api_keys
                  </a>
                  에 접속하세요
                </li>
                <li>새 API 키를 생성하세요</li>
              </>
            )}
            <li>아래에 붙여넣기하세요</li>
          </ol>
        </div>

        <div className="token-input-group" style={{ marginTop: 16 }}>
          <input
            type="password"
            className="token-input"
            placeholder={isClaude ? "sk-ant-api03-..." : "sk-..."}
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
          키는 ~/.config/nare/credentials/에 로컬 저장됩니다 (chmod 600).
          API 호출 외에는 외부로 전송되지 않습니다.
        </p>

        <button
          className="btn btn-ghost"
          onClick={() => { setProvider(null); setError(null); setApiKey(""); }}
          style={{ marginTop: 8 }}
        >
          ← 다른 제공자 선택
        </button>
      </div>
    </div>
  );
}
