import { useI18n, Lang } from "../../i18n";

interface Props {
  onSelected: () => void;
}

const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "sv", label: "Swedish", native: "Svenska" },
];

export default function LanguageStep({ onSelected }: Props) {
  const { setLang } = useI18n();

  function handleSelect(code: Lang) {
    setLang(code);
    try { localStorage.setItem("nare-lang-chosen", "1"); } catch {}
    onSelected();
  }

  return (
    <div className="step">
      <div className="step-icon">🌐</div>
      <div className="brand-name">NARE</div>
      <p style={{ marginTop: 8, marginBottom: 24 }}>Choose your language / 언어를 선택하세요 / Välj ditt språk</p>
      <div className="lang-cards">
        {LANGUAGES.map(({ code, native }) => (
          <button
            key={code}
            className="lang-card"
            onClick={() => handleSelect(code)}
          >
            <span className="lang-card-native">{native}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
