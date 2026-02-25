import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../../i18n";

interface Props {
  claudeAuthed: boolean;
  messengerId: string | null;
}

export default function DoneStep({ claudeAuthed, messengerId }: Props) {
  const { t } = useI18n();

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
      <h1>{t("done.title")}</h1>
      <p>{t("done.desc")}</p>

      <div className="done-details">
        <div className="done-row">
          <span className="done-key">{t("done.provider")}</span>
          <span>{claudeAuthed ? t("done.configured") : t("done.notConfigured")}</span>
        </div>
        <div className="done-row">
          <span className="done-key">{t("done.messenger")}</span>
          <span>
            {messengerId
              ? `${t("done.msgConnected")} (${messengerId})`
              : t("done.msgNotConnected")}
          </span>
        </div>
        <div className="done-row">
          <span className="done-key">{t("done.configFile")}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            ~/.config/nare/config.toml
          </span>
        </div>
      </div>

      <div className="step-actions">
        <button className="btn btn-primary" onClick={startServices}>
          {t("done.startBtn")}
        </button>
        <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {t("done.hint")}
        </p>
      </div>
    </div>
  );
}
