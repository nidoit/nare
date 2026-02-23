import { useState } from "react";
import WelcomeStep from "./steps/WelcomeStep";
import ClaudeAuthStep from "./steps/ClaudeAuthStep";
import WhatsAppStep from "./steps/WhatsAppStep";
import DoneStep from "./steps/DoneStep";

interface Props {
  initialClaudeConfigured: boolean;
  initialWaConfigured: boolean;
}

const STEPS = ["Welcome", "Claude", "WhatsApp", "Done"];

export default function SetupWizard({
  initialClaudeConfigured,
  initialWaConfigured,
}: Props) {
  // Start past already-completed steps
  const initialStep = initialWaConfigured ? 3 : initialClaudeConfigured ? 2 : 0;

  const [step, setStep] = useState(initialStep);
  const [claudeAuthed, setClaudeAuthed] = useState(initialClaudeConfigured);
  const [waPhone, setWaPhone] = useState<string | null>(null);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="wizard">
      {/* Progress bar */}
      <div className="wizard-progress">
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: "contents" }}>
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
          <WhatsAppStep onConnected={(phone) => setWaPhone(phone)} />
        )}
        {step === 3 && (
          <DoneStep claudeAuthed={claudeAuthed} waPhone={waPhone} />
        )}
      </div>

      {/* Footer navigation */}
      <div className="wizard-footer">
        {step > 0 && step < STEPS.length - 1 && (
          <button className="btn btn-ghost" onClick={back}>
            ← Back
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button
            className="btn btn-primary"
            onClick={next}
            disabled={
              (step === 1 && !claudeAuthed) ||
              (step === 2 && !waPhone)
            }
          >
            {step === STEPS.length - 2 ? "Finish →" : "Next →"}
          </button>
        )}
      </div>
    </div>
  );
}
