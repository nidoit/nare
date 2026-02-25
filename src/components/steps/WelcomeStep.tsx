export default function WelcomeStep() {
  return (
    <div className="step">
      <div className="step-icon">🤖</div>
      <div className="brand-name">NARE</div>
      <p className="brand-tagline">Notification &amp; Automated Reporting Engine</p>
      <p>
        메신저로 자연어 명령을 보내 Blunux Linux 시스템을 관리하세요.
      </p>
      <ul className="feature-list">
        <li>
          <span className="feat-icon">🤖</span>
          <span>
            <strong>AI 기반</strong> — Claude가 사용자의 요청을 이해합니다
          </span>
        </li>
        <li>
          <span className="feat-icon">💬</span>
          <span>
            <strong>메신저 연동</strong> — Telegram 또는 WhatsApp으로 소통
          </span>
        </li>
        <li>
          <span className="feat-icon">⚙️</span>
          <span>
            <strong>시스템 도구</strong> — 패키지 설치, 서비스 관리, 로그 확인
          </span>
        </li>
        <li>
          <span className="feat-icon">🔒</span>
          <span>
            <strong>안전 설계</strong> — 위험한 명령은 항상 확인을 요청합니다
          </span>
        </li>
      </ul>
      <p style={{ marginTop: "20px", fontSize: "12px" }}>
        이 마법사가 Claude API와 메신저를 연결해드립니다.
      </p>
    </div>
  );
}
