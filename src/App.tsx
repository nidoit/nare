import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import SetupWizard from "./components/SetupWizard";

interface SetupStatus {
  claude_configured: boolean;
  messenger_configured: boolean;
}

export default function App() {
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    invoke<SetupStatus>("check_setup_status").then(setStatus);
  }, []);

  if (!status) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }

  const setupComplete = status.claude_configured && status.messenger_configured;

  if (!setupComplete) {
    return (
      <SetupWizard
        initialClaudeConfigured={status.claude_configured}
        initialMessengerConfigured={status.messenger_configured}
      />
    );
  }

  return (
    <div className="app-ready">
      <div className="ready-content">
        <div className="ready-icon">✅</div>
        <h2>NARE is running</h2>
        <p>
          Your system is connected. Send a message to start managing
          your Linux system.
        </p>
        <p className="subtext">
          Use <code>blunux-ai status</code> from the terminal to check service
          status.
        </p>
      </div>
    </div>
  );
}
