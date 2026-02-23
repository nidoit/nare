export default function WelcomeStep() {
  return (
    <div className="step">
      <div className="step-icon">🤖</div>
      <div className="brand-name">NARE</div>
      <p className="brand-tagline">Notification &amp; Automated Reporting Engine</p>
      <p>
        Manage your Blunux Linux system through natural language — right from
        WhatsApp.
      </p>
      <ul className="feature-list">
        <li>
          <span className="feat-icon">🤖</span>
          <span>
            <strong>AI-powered</strong> — Claude or DeepSeek understands your
            requests
          </span>
        </li>
        <li>
          <span className="feat-icon">💬</span>
          <span>
            <strong>WhatsApp interface</strong> — no new app to learn
          </span>
        </li>
        <li>
          <span className="feat-icon">⚙️</span>
          <span>
            <strong>System tools</strong> — install packages, manage services,
            read logs
          </span>
        </li>
        <li>
          <span className="feat-icon">🔒</span>
          <span>
            <strong>Safe by default</strong> — destructive commands always ask
            first
          </span>
        </li>
      </ul>
      <p style={{ marginTop: "20px", fontSize: "12px" }}>
        This wizard will connect NARE to Claude and your WhatsApp in two steps.
      </p>
    </div>
  );
}
