import { useState } from "react";
import WelcomeStep from "./steps/WelcomeStep";
import ClaudeAuthStep from "./steps/ClaudeAuthStep";
import MessengerStep from "./steps/MessengerStep";
import DoneStep from "./steps/DoneStep";
import { useI18n } from "../i18n";

interface Props {
  initialClaudeConfigured: boolean;
  initialMessengerConfigured: boolean;
}

export default function SetupWizard({
  initialClaudeConfigured,
  initialMessengerConfigured,
}: Props) {
  const { t } = useI18n();
  const STEPS = [t("steps.start"), t("steps.ai"), t("steps.messenger"), t("steps.done")];

  const initialStep = initialMessengerConfigured ? 3 : initialClaudeConfigured ? 2 : 0;

  const [step, setStep] = useState(initialStep);
  const [claudeAuthed, setClaudeAuthed] = useState(initialClaudeConfigured);
  const [messengerId, setMessengerId] = useState<string | null>(null);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="wizard">
      {/* Progress bar */}
      <div className="wizard-progress">
        {STEPS.map((label, i) => (
          <div key={i} style={{ display: "contents" }}>
            {i > 0 && (
              <div className={`step-connector ${i <= step ? "done" : ""}`} />
            )}
            <div className="wizard-step-dot">
              <div
                className={`dot-circle ${
                  i < step ? "done" : i === step ? "active" : ""
                }`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span
                className={`dot-label ${
                  i < step ? "done" : i === step ? "active" : ""
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="wizard-content">
        {step === 0 && <WelcomeStep />}
        {step === 1 && (
          <ClaudeAuthStep
            authed={claudeAuthed}
            onAuthed={() => setClaudeAuthed(true)}
          />
        )}
        {step === 2 && (
          <MessengerStep onConnected={(id) => setMessengerId(id)} />
        )}
        {step === 3 && (
          <DoneStep claudeAuthed={claudeAuthed} messengerId={messengerId} />
        )}
      </div>

      {/* Footer navigation */}
      <div className="wizard-footer">
        {step > 0 && step < STEPS.length - 1 && (
          <button className="btn btn-ghost" onClick={back}>
            {t("nav.back")}
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button
            className="btn btn-primary"
            onClick={next}
            disabled={
              (step === 1 && !claudeAuthed) ||
              (step === 2 && !messengerId)
            }
          >
            {step === STEPS.length - 2 ? t("nav.finish") : t("nav.next")}
          </button>
        )}
      </div>
    </div>
  );
}
