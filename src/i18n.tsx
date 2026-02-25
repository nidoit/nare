import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Lang = "ko" | "sv";

const strings = {
  // ── Setup Wizard ──────────────────────────────────────────────────
  "steps.start":          { ko: "시작",     sv: "Start" },
  "steps.ai":             { ko: "AI",       sv: "AI" },
  "steps.messenger":      { ko: "메신저",   sv: "Meddelande" },
  "steps.done":           { ko: "완료",     sv: "Klar" },
  "nav.back":             { ko: "← 이전",   sv: "← Tillbaka" },
  "nav.next":             { ko: "다음 →",   sv: "Nästa →" },
  "nav.finish":           { ko: "완료 →",   sv: "Klar →" },
  "nav.goBack":           { ko: "← 돌아가기", sv: "← Tillbaka" },

  // ── Welcome Step ──────────────────────────────────────────────────
  "welcome.tagline":      { ko: "Notification & Automated Reporting Engine", sv: "Notification & Automated Reporting Engine" },
  "welcome.description":  { ko: "메신저로 자연어 명령을 보내 Blunux Linux 시스템을 관리하세요.", sv: "Hantera ditt Blunux Linux-system genom att skicka kommandon via meddelanden." },
  "welcome.feat.ai":      { ko: "AI 기반", sv: "AI-driven" },
  "welcome.feat.aiDesc":  { ko: "Claude 또는 DeepSeek이 사용자의 요청을 이해합니다", sv: "Claude eller DeepSeek förstår dina förfrågningar" },
  "welcome.feat.msg":     { ko: "메신저 연동", sv: "Meddelandeintegration" },
  "welcome.feat.msgDesc": { ko: "Telegram으로 소통", sv: "Kommunicera via Telegram" },
  "welcome.feat.tools":   { ko: "시스템 도구", sv: "Systemverktyg" },
  "welcome.feat.toolsDesc": { ko: "패키지 설치, 서비스 관리, 로그 확인", sv: "Installera paket, hantera tjänster, visa loggar" },
  "welcome.feat.safe":    { ko: "안전 설계", sv: "Säker design" },
  "welcome.feat.safeDesc": { ko: "위험한 명령은 항상 확인을 요청합니다", sv: "Farliga kommandon kräver alltid bekräftelse" },
  "welcome.wizardHint":   { ko: "이 마법사가 AI와 메신저를 연결해드립니다.", sv: "Den här guiden kopplar ihop AI och meddelanden åt dig." },

  // ── AI Auth Step ──────────────────────────────────────────────────
  "ai.title":             { ko: "AI 제공자", sv: "AI-leverantör" },
  "ai.keyConfigured":     { ko: "✓ 설정됨", sv: "✓ Konfigurerad" },
  "ai.selectTitle":       { ko: "AI 제공자 선택", sv: "Välj AI-leverantör" },
  "ai.selectDesc":        { ko: "NARE가 사용할 AI를 선택하세요.", sv: "Välj vilken AI NARE ska använda." },
  "ai.claudeDesc":        { ko: "Anthropic — PRO/MAX 구독으로 웹 로그인", sv: "Anthropic — logga in via webben med PRO/MAX-prenumeration" },
  "ai.deepseekDesc":      { ko: "DeepSeek — 우수한 성능, 저렴한 가격", sv: "DeepSeek — utmärkt prestanda, lågt pris" },
  "ai.claudeProMax":      { ko: "PRO/MAX", sv: "PRO/MAX" },
  "ai.cheapBadge":        { ko: "저렴", sv: "Billig" },

  // Claude OAuth
  "ai.claudeLoginTitle":  { ko: "Claude 로그인", sv: "Claude-inloggning" },
  "ai.claudeLoginDesc":   { ko: "Claude PRO 또는 MAX 구독이 필요합니다. 브라우저에서 로그인하세요.", sv: "Du behöver en Claude PRO- eller MAX-prenumeration. Logga in via webbläsaren." },
  "ai.claudeLoginBtn":    { ko: "Claude 로그인 →", sv: "Logga in på Claude →" },
  "ai.claudeLoginWait":   { ko: "로그인 대기 중...", sv: "Väntar på inloggning..." },
  "ai.claudeLoggedIn":    { ko: "✓ Claude 로그인 완료", sv: "✓ Inloggad på Claude" },

  // DeepSeek API
  "ai.deepseekTitle":     { ko: "DeepSeek API 키", sv: "DeepSeek API-nyckel" },
  "ai.deepseekDesc":      { ko: "DeepSeek API 키를 입력하세요.", sv: "Ange din DeepSeek API-nyckel." },
  "ai.deepseekStep1":     { ko: "에 접속하세요", sv: "Gå till" },
  "ai.deepseekStep2":     { ko: "새 API 키를 생성하세요", sv: "Skapa en ny API-nyckel" },
  "ai.deepseekStep3":     { ko: "아래에 붙여넣기하세요", sv: "Klistra in den nedan" },
  "ai.keyRequired":       { ko: "API 키를 입력해주세요", sv: "Ange en API-nyckel" },
  "ai.keyInvalidDs":      { ko: "올바르지 않은 형식입니다. DeepSeek API 키는 'sk-'로 시작합니다", sv: "Ogiltigt format. DeepSeek API-nyckeln börjar med 'sk-'" },
  "ai.save":              { ko: "저장", sv: "Spara" },
  "ai.saving":            { ko: "저장 중...", sv: "Sparar..." },
  "ai.credNote":          { ko: "키는 ~/.config/nare/credentials/에 로컬 저장됩니다 (chmod 600). API 호출 외에는 외부로 전송되지 않습니다.", sv: "Nyckeln sparas lokalt i ~/.config/nare/credentials/ (chmod 600). Den skickas aldrig utanför API-anropet." },
  "ai.backToSelect":      { ko: "← 다른 제공자 선택", sv: "← Välj en annan leverantör" },

  // ── Messenger Step (Telegram only) ────────────────────────────────
  "msg.title":            { ko: "Telegram 연결", sv: "Anslut Telegram" },
  "msg.desc":             { ko: "Telegram Bot으로 NARE와 소통하세요.", sv: "Kommunicera med NARE via en Telegram-bot." },
  "msg.setupTitle":       { ko: "Telegram 봇 설정", sv: "Konfigurera Telegram-bot" },
  "msg.step1":            { ko: "Telegram에서 @BotFather에게 메시지를 보내세요", sv: "Skicka ett meddelande till @BotFather på Telegram" },
  "msg.step2":            { ko: "/newbot을 보내고 안내를 따르세요", sv: "Skicka /newbot och följ instruktionerna" },
  "msg.step3":            { ko: "봇 토큰을 복사해서 아래에 붙여넣기하세요", sv: "Kopiera bot-token och klistra in nedan" },
  "msg.tokenRequired":    { ko: "봇 토큰을 입력해주세요", sv: "Ange bot-token" },
  "msg.connect":          { ko: "연결", sv: "Anslut" },
  "msg.connecting":       { ko: "Telegram 연결 중...", sv: "Ansluter till Telegram..." },
  "msg.verifying":        { ko: "봇 토큰 확인 중...", sv: "Verifierar bot-token..." },
  "msg.sendStart":        { ko: "봇에게 /start를 보내세요", sv: "Skicka /start till boten" },
  "msg.sendStartDesc":    { ko: "에게 메시지를 보내세요", sv: "Skicka ett meddelande till" },
  "msg.openTelegram":     { ko: "핸드폰이나 PC에서 Telegram을 여세요", sv: "Öppna Telegram på telefonen eller datorn" },
  "msg.findBot":          { ko: "봇을 찾으세요:", sv: "Hitta boten:" },
  "msg.sendStartCmd":     { ko: "/start를 보내서 연결하세요", sv: "Skicka /start för att ansluta" },
  "msg.waitingStart":     { ko: "/start 대기 중...", sv: "Väntar på /start..." },
  "msg.connected":        { ko: "Telegram 연결 완료", sv: "Telegram anslutet" },
  "msg.connectedBadge":   { ko: "✓ 연결됨", sv: "✓ Ansluten" },
  "msg.error":            { ko: "연결 오류", sv: "Anslutningsfel" },
  "msg.retry":            { ko: "다시 시도", sv: "Försök igen" },

  // ── Done Step ─────────────────────────────────────────────────────
  "done.title":           { ko: "설정 완료!", sv: "Konfigurationen klar!" },
  "done.desc":            { ko: "NARE가 설정되었습니다. 메신저로 메시지를 보내서 시스템을 관리하세요.", sv: "NARE är konfigurerad. Skicka meddelanden för att hantera ditt system." },
  "done.provider":        { ko: "AI 제공자", sv: "AI-leverantör" },
  "done.configured":      { ko: "✅ 설정됨", sv: "✅ Konfigurerad" },
  "done.notConfigured":   { ko: "⚠️ 미설정", sv: "⚠️ Ej konfigurerad" },
  "done.messenger":       { ko: "메신저", sv: "Meddelanden" },
  "done.msgConnected":    { ko: "✅ 연결됨", sv: "✅ Ansluten" },
  "done.msgNotConnected": { ko: "⚠️ 미연결", sv: "⚠️ Ej ansluten" },
  "done.configFile":      { ko: "설정 파일", sv: "Konfigurationsfil" },
  "done.startBtn":        { ko: "NARE 시작 →", sv: "Starta NARE →" },
  "done.hint":            { ko: "메신저에서 \"디스크 사용량 알려줘\"를 보내보세요", sv: "Prova att skicka \"Hur mycket diskutrymme finns kvar?\" i meddelanden" },

  // ── App (Dashboard & Settings) ────────────────────────────────────
  "app.running":          { ko: "NARE 실행 중", sv: "NARE körs" },
  "app.runningDesc":      { ko: "시스템이 연결되었습니다. 메신저로 메시지를 보내서 Linux 시스템을 관리하세요.", sv: "Systemet är anslutet. Skicka meddelanden för att hantera ditt Linux-system." },
  "app.settings":         { ko: "설정", sv: "Inställningar" },
  "app.resetSetup":       { ko: "설정 초기화", sv: "Återställ inställningar" },
  "app.resetConfirm":     { ko: "설정을 초기화하고 설정 마법사를 다시 시작할까요?", sv: "Vill du återställa inställningarna och starta om installationsguiden?" },
  "app.provider":         { ko: "제공자:", sv: "Leverantör:" },
  "app.notSet":           { ko: "설정 안됨", sv: "Ej inställd" },
  "app.apiKeySaved":      { ko: "✓ API 키가 저장되었습니다", sv: "✓ API-nyckeln har sparats" },
  "app.apiKeyRequired":   { ko: "API 키를 입력해주세요", sv: "Ange en API-nyckel" },
  "app.apiKeyInvalidDs":  { ko: "올바르지 않은 형식입니다. DeepSeek API 키는 'sk-'로 시작합니다", sv: "Ogiltigt format. DeepSeek API-nyckeln börjar med 'sk-'" },
  "app.apiKeyGetFrom":    { ko: "에서 API 키를 발급받을 수 있습니다", sv: "Du kan hämta en API-nyckel från" },
  "app.messengerLabel":   { ko: "메신저", sv: "Meddelanden" },
  "app.connectionLabel":  { ko: "연결:", sv: "Anslutning:" },
  "app.notConnected":     { ko: "연결 안됨", sv: "Ej ansluten" },
  "app.resetSection":     { ko: "초기화", sv: "Återställ" },
  "app.resetDesc":        { ko: "모든 설정을 삭제하고 설정 마법사를 다시 시작합니다.", sv: "Ta bort alla inställningar och starta om installationsguiden." },
  "app.language":         { ko: "언어", sv: "Språk" },
  "app.langLabel":        { ko: "언어:", sv: "Språk:" },
} as const;

type StringKey = keyof typeof strings;

interface I18nContext {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: StringKey) => string;
}

const I18nCtx = createContext<I18nContext>({
  lang: "ko",
  setLang: () => {},
  t: (key) => strings[key]?.ko ?? key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("nare-lang");
      if (saved === "sv" || saved === "ko") return saved;
    } catch {}
    return "ko";
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
