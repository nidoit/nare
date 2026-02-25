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
    window.location.reload();
  }

  return (
    <div className="step">
      <div className="step-icon">🎉</div>
      <h1>설정 완료!</h1>
      <p>
        NARE가 설정되었습니다. 메신저로 메시지를 보내서 시스템을 관리하세요.
      </p>

      <div className="done-details">
        <div className="done-row">
          <span className="done-key">Claude API</span>
          <span>{claudeAuthed ? "✅ 설정됨" : "⚠️ 미설정"}</span>
        </div>
        <div className="done-row">
          <span className="done-key">메신저</span>
          <span>{waPhone ? `✅ 연결됨 (${waPhone})` : "⚠️ 미연결"}</span>
        </div>
        <div className="done-row">
          <span className="done-key">설정 파일</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            ~/.config/nare/config.toml
          </span>
        </div>
      </div>

      <div className="step-actions">
        <button className="btn btn-primary" onClick={startServices}>
          NARE 시작 →
        </button>
        <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          메신저에서 "디스크 사용량 알려줘"를 보내보세요
        </p>
      </div>
    </div>
  );
}
