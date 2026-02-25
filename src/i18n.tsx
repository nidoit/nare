import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Lang = "en" | "ko" | "sv";

const strings = {
  // ── Language Selection (pre-wizard) ─────────────────────────────────
  "lang.title":           { en: "Choose your language", ko: "언어를 선택하세요", sv: "Välj ditt språk" },
  "lang.subtitle":        { en: "All setup instructions will be shown in your language.", ko: "모든 설정 안내가 선택한 언어로 표시됩니다.", sv: "Alla installationsinstruktioner visas på ditt språk." },

  // ── Setup Wizard ──────────────────────────────────────────────────
  "steps.start":          { en: "Start",     ko: "시작",     sv: "Start" },
  "steps.ai":             { en: "AI",        ko: "AI",       sv: "AI" },
  "steps.messenger":      { en: "Messenger", ko: "메신저",   sv: "Meddelande" },
  "steps.done":           { en: "Done",      ko: "완료",     sv: "Klar" },
  "nav.back":             { en: "← Back",    ko: "← 이전",   sv: "← Tillbaka" },
  "nav.next":             { en: "Next →",    ko: "다음 →",   sv: "Nästa →" },
  "nav.finish":           { en: "Finish →",  ko: "완료 →",   sv: "Klar →" },
  "nav.goBack":           { en: "← Back",    ko: "← 돌아가기", sv: "← Tillbaka" },

  // ── Welcome Step ──────────────────────────────────────────────────
  "welcome.tagline":      { en: "Notification & Automated Reporting Engine", ko: "Notification & Automated Reporting Engine", sv: "Notification & Automated Reporting Engine" },
  "welcome.description":  { en: "Manage your Blunux Linux system by sending natural language commands via messenger.", ko: "메신저로 자연어 명령을 보내 Blunux Linux 시스템을 관리하세요.", sv: "Hantera ditt Blunux Linux-system genom att skicka kommandon via meddelanden." },
  "welcome.feat.ai":      { en: "AI-powered", ko: "AI 기반", sv: "AI-driven" },
  "welcome.feat.aiDesc":  { en: "Claude or DeepSeek understands your requests", ko: "Claude 또는 DeepSeek이 사용자의 요청을 이해합니다", sv: "Claude eller DeepSeek förstår dina förfrågningar" },
  "welcome.feat.msg":     { en: "Messenger integration", ko: "메신저 연동", sv: "Meddelandeintegration" },
  "welcome.feat.msgDesc": { en: "Communicate via Telegram", ko: "Telegram으로 소통", sv: "Kommunicera via Telegram" },
  "welcome.feat.tools":   { en: "System tools", ko: "시스템 도구", sv: "Systemverktyg" },
  "welcome.feat.toolsDesc": { en: "Install packages, manage services, view logs", ko: "패키지 설치, 서비스 관리, 로그 확인", sv: "Installera paket, hantera tjänster, visa loggar" },
  "welcome.feat.safe":    { en: "Safe by design", ko: "안전 설계", sv: "Säker design" },
  "welcome.feat.safeDesc": { en: "Dangerous commands always require confirmation", ko: "위험한 명령은 항상 확인을 요청합니다", sv: "Farliga kommandon kräver alltid bekräftelse" },
  "welcome.wizardHint":   { en: "This wizard will connect AI and messenger for you.", ko: "이 마법사가 AI와 메신저를 연결해드립니다.", sv: "Den här guiden kopplar ihop AI och meddelanden åt dig." },

  // ── AI Auth Step ──────────────────────────────────────────────────
  "ai.title":             { en: "AI Provider", ko: "AI 제공자", sv: "AI-leverantör" },
  "ai.keyConfigured":     { en: "✓ Configured", ko: "✓ 설정됨", sv: "✓ Konfigurerad" },
  "ai.selectTitle":       { en: "Choose AI Provider", ko: "AI 제공자 선택", sv: "Välj AI-leverantör" },
  "ai.selectDesc":        { en: "Choose which AI NARE will use.", ko: "NARE가 사용할 AI를 선택하세요.", sv: "Välj vilken AI NARE ska använda." },
  "ai.claudeDesc":        { en: "Anthropic — Sign in with PRO/MAX subscription", ko: "Anthropic — PRO/MAX 구독으로 웹 로그인", sv: "Anthropic — logga in via webben med PRO/MAX-prenumeration" },
  "ai.deepseekDesc":      { en: "DeepSeek — Excellent performance, low price", ko: "DeepSeek — 우수한 성능, 저렴한 가격", sv: "DeepSeek — utmärkt prestanda, lågt pris" },
  "ai.claudeProMax":      { en: "PRO/MAX", ko: "PRO/MAX", sv: "PRO/MAX" },
  "ai.cheapBadge":        { en: "Cheap", ko: "저렴", sv: "Billig" },

  // Claude OAuth
  "ai.claudeLoginTitle":  { en: "Claude Sign In", ko: "Claude 로그인", sv: "Claude-inloggning" },
  "ai.claudeLoginDesc":   { en: "A Claude PRO or MAX subscription is required. Sign in via the browser.", ko: "Claude PRO 또는 MAX 구독이 필요합니다. 브라우저에서 로그인하세요.", sv: "Du behöver en Claude PRO- eller MAX-prenumeration. Logga in via webbläsaren." },
  "ai.claudeLoginBtn":    { en: "Sign in to Claude →", ko: "Claude 로그인 →", sv: "Logga in på Claude →" },
  "ai.claudeLoginWait":   { en: "Waiting for sign in...", ko: "로그인 대기 중...", sv: "Väntar på inloggning..." },
  "ai.claudeLoggedIn":    { en: "✓ Signed in to Claude", ko: "✓ Claude 로그인 완료", sv: "✓ Inloggad på Claude" },

  // DeepSeek API
  "ai.deepseekTitle":     { en: "DeepSeek API Key", ko: "DeepSeek API 키", sv: "DeepSeek API-nyckel" },
  "ai.deepseekInputDesc": { en: "Enter your DeepSeek API key.", ko: "DeepSeek API 키를 입력하세요.", sv: "Ange din DeepSeek API-nyckel." },
  "ai.deepseekStep1":     { en: "Go to", ko: "에 접속하세요", sv: "Gå till" },
  "ai.deepseekStep2":     { en: "Create a new API key", ko: "새 API 키를 생성하세요", sv: "Skapa en ny API-nyckel" },
  "ai.deepseekStep3":     { en: "Paste it below", ko: "아래에 붙여넣기하세요", sv: "Klistra in den nedan" },
  "ai.keyRequired":       { en: "Please enter an API key", ko: "API 키를 입력해주세요", sv: "Ange en API-nyckel" },
  "ai.keyInvalidDs":      { en: "Invalid format. DeepSeek API keys start with 'sk-'", ko: "올바르지 않은 형식입니다. DeepSeek API 키는 'sk-'로 시작합니다", sv: "Ogiltigt format. DeepSeek API-nyckeln börjar med 'sk-'" },
  "ai.save":              { en: "Save", ko: "저장", sv: "Spara" },
  "ai.saving":            { en: "Saving...", ko: "저장 중...", sv: "Sparar..." },
  "ai.credNote":          { en: "The key is stored locally in ~/.config/nare/credentials/ (chmod 600). It is never sent outside the API call.", ko: "키는 ~/.config/nare/credentials/에 로컬 저장됩니다 (chmod 600). API 호출 외에는 외부로 전송되지 않습니다.", sv: "Nyckeln sparas lokalt i ~/.config/nare/credentials/ (chmod 600). Den skickas aldrig utanför API-anropet." },
  "ai.backToSelect":      { en: "← Choose a different provider", ko: "← 다른 제공자 선택", sv: "← Välj en annan leverantör" },

  // ── Messenger Step (Telegram only) ────────────────────────────────
  "msg.title":            { en: "Connect Telegram", ko: "Telegram 연결", sv: "Anslut Telegram" },
  "msg.desc":             { en: "Communicate with NARE via a Telegram bot.", ko: "Telegram Bot으로 NARE와 소통하세요.", sv: "Kommunicera med NARE via en Telegram-bot." },
  "msg.setupTitle":       { en: "Set Up Telegram Bot", ko: "Telegram 봇 설정", sv: "Konfigurera Telegram-bot" },
  "msg.step1":            { en: "Send a message to @BotFather on Telegram", ko: "Telegram에서 @BotFather에게 메시지를 보내세요", sv: "Skicka ett meddelande till @BotFather på Telegram" },
  "msg.step2":            { en: "Send /newbot and follow the instructions", ko: "/newbot을 보내고 안내를 따르세요", sv: "Skicka /newbot och följ instruktionerna" },
  "msg.step3":            { en: "Copy the bot token and paste it below", ko: "봇 토큰을 복사해서 아래에 붙여넣기하세요", sv: "Kopiera bot-token och klistra in nedan" },
  "msg.tokenRequired":    { en: "Please enter the bot token", ko: "봇 토큰을 입력해주세요", sv: "Ange bot-token" },
  "msg.connect":          { en: "Connect", ko: "연결", sv: "Anslut" },
  "msg.connecting":       { en: "Connecting to Telegram...", ko: "Telegram 연결 중...", sv: "Ansluter till Telegram..." },
  "msg.verifying":        { en: "Verifying bot token...", ko: "봇 토큰 확인 중...", sv: "Verifierar bot-token..." },
  "msg.sendStart":        { en: "Send /start to the bot", ko: "봇에게 /start를 보내세요", sv: "Skicka /start till boten" },
  "msg.sendStartDesc":    { en: "Send a message to", ko: "에게 메시지를 보내세요", sv: "Skicka ett meddelande till" },
  "msg.openTelegram":     { en: "Open Telegram on your phone or PC", ko: "핸드폰이나 PC에서 Telegram을 여세요", sv: "Öppna Telegram på telefonen eller datorn" },
  "msg.findBot":          { en: "Find the bot:", ko: "봇을 찾으세요:", sv: "Hitta boten:" },
  "msg.sendStartCmd":     { en: "Send /start to connect", ko: "/start를 보내서 연결하세요", sv: "Skicka /start för att ansluta" },
  "msg.waitingStart":     { en: "Waiting for /start...", ko: "/start 대기 중...", sv: "Väntar på /start..." },
  "msg.connected":        { en: "Telegram connected", ko: "Telegram 연결 완료", sv: "Telegram anslutet" },
  "msg.connectedBadge":   { en: "✓ Connected", ko: "✓ 연결됨", sv: "✓ Ansluten" },
  "msg.error":            { en: "Connection error", ko: "연결 오류", sv: "Anslutningsfel" },
  "msg.retry":            { en: "Retry", ko: "다시 시도", sv: "Försök igen" },

  // ── Done Step ─────────────────────────────────────────────────────
  "done.title":           { en: "Setup Complete!", ko: "설정 완료!", sv: "Konfigurationen klar!" },
  "done.desc":            { en: "NARE is configured. Send messages via messenger to manage your system.", ko: "NARE가 설정되었습니다. 메신저로 메시지를 보내서 시스템을 관리하세요.", sv: "NARE är konfigurerad. Skicka meddelanden för att hantera ditt system." },
  "done.provider":        { en: "AI Provider", ko: "AI 제공자", sv: "AI-leverantör" },
  "done.configured":      { en: "✅ Configured", ko: "✅ 설정됨", sv: "✅ Konfigurerad" },
  "done.notConfigured":   { en: "⚠️ Not configured", ko: "⚠️ 미설정", sv: "⚠️ Ej konfigurerad" },
  "done.messenger":       { en: "Messenger", ko: "메신저", sv: "Meddelanden" },
  "done.msgConnected":    { en: "✅ Connected", ko: "✅ 연결됨", sv: "✅ Ansluten" },
  "done.msgNotConnected": { en: "⚠️ Not connected", ko: "⚠️ 미연결", sv: "⚠️ Ej ansluten" },
  "done.configFile":      { en: "Config file", ko: "설정 파일", sv: "Konfigurationsfil" },
  "done.startBtn":        { en: "Start NARE →", ko: "NARE 시작 →", sv: "Starta NARE →" },
  "done.hint":            { en: "Try sending \"How much disk space is left?\" in messenger", ko: "메신저에서 \"디스크 사용량 알려줘\"를 보내보세요", sv: "Prova att skicka \"Hur mycket diskutrymme finns kvar?\" i meddelanden" },

  // ── App (Dashboard & Settings) ────────────────────────────────────
  "app.running":          { en: "NARE Running", ko: "NARE 실행 중", sv: "NARE körs" },
  "app.runningDesc":      { en: "System connected. Send messages via messenger to manage your Linux system.", ko: "시스템이 연결되었습니다. 메신저로 메시지를 보내서 Linux 시스템을 관리하세요.", sv: "Systemet är anslutet. Skicka meddelanden för att hantera ditt Linux-system." },
  "app.settings":         { en: "Settings", ko: "설정", sv: "Inställningar" },
  "app.resetSetup":       { en: "Reset Setup", ko: "설정 초기화", sv: "Återställ inställningar" },
  "app.resetConfirm":     { en: "Reset all settings and restart the setup wizard?", ko: "설정을 초기화하고 설정 마법사를 다시 시작할까요?", sv: "Vill du återställa inställningarna och starta om installationsguiden?" },
  "app.provider":         { en: "Provider:", ko: "제공자:", sv: "Leverantör:" },
  "app.notSet":           { en: "Not set", ko: "설정 안됨", sv: "Ej inställd" },
  "app.apiKeySaved":      { en: "✓ API key saved", ko: "✓ API 키가 저장되었습니다", sv: "✓ API-nyckeln har sparats" },
  "app.apiKeyRequired":   { en: "Please enter an API key", ko: "API 키를 입력해주세요", sv: "Ange en API-nyckel" },
  "app.apiKeyInvalidDs":  { en: "Invalid format. DeepSeek API keys start with 'sk-'", ko: "올바르지 않은 형식입니다. DeepSeek API 키는 'sk-'로 시작합니다", sv: "Ogiltigt format. DeepSeek API-nyckeln börjar med 'sk-'" },
  "app.apiKeyGetFrom":    { en: "Get an API key from", ko: "에서 API 키를 발급받을 수 있습니다", sv: "Du kan hämta en API-nyckel från" },
  "app.messengerLabel":   { en: "Messenger", ko: "메신저", sv: "Meddelanden" },
  "app.connectionLabel":  { en: "Connection:", ko: "연결:", sv: "Anslutning:" },
  "app.notConnected":     { en: "Not connected", ko: "연결 안됨", sv: "Ej ansluten" },
  "app.resetSection":     { en: "Reset", ko: "초기화", sv: "Återställ" },
  "app.resetDesc":        { en: "Delete all settings and restart the setup wizard.", ko: "모든 설정을 삭제하고 설정 마법사를 다시 시작합니다.", sv: "Ta bort alla inställningar och starta om installationsguiden." },
  "app.language":         { en: "Language", ko: "언어", sv: "Språk" },
  "app.langLabel":        { en: "Language:", ko: "언어:", sv: "Språk:" },

  // ── Permissions ─────────────────────────────────────────────────
  "perm.title":           { en: "Command Permissions", ko: "명령 권한", sv: "Kommandorättigheter" },
  "perm.desc":            { en: "Pre-approve command categories so AI can execute them automatically without asking each time.", ko: "명령 카테고리를 미리 승인하면 AI가 매번 묻지 않고 자동으로 실행합니다.", sv: "Förhandsgodkänn kommandokategorier så att AI kan köra dem automatiskt utan att fråga varje gång." },
  "perm.safeNote":        { en: "System info commands (disk, memory, processes, logs, network) are always allowed.", ko: "시스템 정보 명령 (디스크, 메모리, 프로세스, 로그, 네트워크)은 항상 허용됩니다.", sv: "Systeminfokommandon (disk, minne, processer, loggar, nätverk) är alltid tillåtna." },
  "perm.install":         { en: "Install packages", ko: "패키지 설치", sv: "Installera paket" },
  "perm.installDesc":     { en: "pacman -S, yay -S", ko: "pacman -S, yay -S", sv: "pacman -S, yay -S" },
  "perm.remove":          { en: "Remove packages", ko: "패키지 제거", sv: "Ta bort paket" },
  "perm.removeDesc":      { en: "pacman -R, yay -R", ko: "pacman -R, yay -R", sv: "pacman -R, yay -R" },
  "perm.update":          { en: "System update", ko: "시스템 업데이트", sv: "Systemuppdatering" },
  "perm.updateDesc":      { en: "pacman -Syu, yay -Syu", ko: "pacman -Syu, yay -Syu", sv: "pacman -Syu, yay -Syu" },
  "perm.services":        { en: "Manage services", ko: "서비스 관리", sv: "Hantera tjänster" },
  "perm.servicesDesc":    { en: "systemctl start/stop/enable/disable", ko: "systemctl start/stop/enable/disable", sv: "systemctl start/stop/enable/disable" },
  "perm.general":         { en: "Other commands", ko: "기타 명령", sv: "Övriga kommandon" },
  "perm.generalDesc":     { en: "Any other shell command (sudo included)", ko: "기타 쉘 명령 (sudo 포함)", sv: "Alla andra skalkommandon (inklusive sudo)" },
  "perm.saved":           { en: "Permissions saved", ko: "권한이 저장되었습니다", sv: "Rättigheter sparade" },
} as const;

type StringKey = keyof typeof strings;

interface I18nContext {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: StringKey) => string;
}

const I18nCtx = createContext<I18nContext>({
  lang: "en",
  setLang: () => {},
  t: (key) => strings[key]?.en ?? key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("nare-lang");
      if (saved === "en" || saved === "sv" || saved === "ko") return saved;
    } catch {}
    return "en";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("nare-lang", l); } catch {}
  }, []);

  const t = useCallback((key: StringKey): string => {
    return strings[key]?.[lang] ?? key;
  }, [lang]);

  return (
    <I18nCtx.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useI18n() {
  return useContext(I18nCtx);
}
