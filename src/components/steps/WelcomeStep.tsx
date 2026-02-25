import { useI18n } from "../../i18n";

export default function WelcomeStep() {
  const { t } = useI18n();

  return (
    <div className="step">
      <div className="step-icon">🤖</div>
      <div className="brand-name">NARE</div>
      <p className="brand-tagline">{t("welcome.tagline")}</p>
      <p>{t("welcome.description")}</p>
      <ul className="feature-list">
        <li>
          <span className="feat-icon">🤖</span>
          <span>
            <strong>{t("welcome.feat.ai")}</strong> — {t("welcome.feat.aiDesc")}
          </span>
        </li>
        <li>
          <span className="feat-icon">💬</span>
          <span>
            <strong>{t("welcome.feat.msg")}</strong> — {t("welcome.feat.msgDesc")}
          </span>
        </li>
        <li>
          <span className="feat-icon">⚙️</span>
          <span>
            <strong>{t("welcome.feat.tools")}</strong> — {t("welcome.feat.toolsDesc")}
          </span>
        </li>
        <li>
          <span className="feat-icon">🔒</span>
          <span>
            <strong>{t("welcome.feat.safe")}</strong> — {t("welcome.feat.safeDesc")}
          </span>
        </li>
      </ul>
      <p style={{ marginTop: "20px", fontSize: "12px" }}>
        {t("welcome.wizardHint")}
      </p>
    </div>
  );
}
