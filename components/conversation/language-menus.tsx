"use client";
import { LANGUAGES, languageNames, type Language } from "@/types/session";
import { translator } from "@/lib/i18n/strings";

type Choice = { language: Language; languageAuto: boolean; languageDetected?: boolean; languageAttempts?: number };
export function LanguageMenus({ mine, theirs, locale = "en", disabled = false, onMine, onTheirs }: {
  mine: Choice; theirs: Choice; locale?: Language; disabled?: boolean;
  onMine: (language: Language | "auto") => void;
  onTheirs: (language: Language | "auto") => void;
}) {
  const t = translator(locale);
  return <div className="language-menus">
    {([{ id: "my-language", label: t("iSpeak"), choice: mine, change: onMine },
      { id: "peer-language", label: t("theySpeak"), choice: theirs, change: onTheirs }]).map(({ id, label, choice, change }) =>
      <div className="language-choice" key={id}>
        <label htmlFor={id}>{label}</label>
        <select id={id} className="language-picker" disabled={disabled}
          value={choice.languageAuto ? "auto" : choice.language}
          onChange={event => change(event.target.value as Language | "auto")}>
          {/* Auto is a mode, not a language: naming one beside it passed a mere suggestion off
              as a detection. The detected result belongs to the hint below, once it exists. */}
          <option value="auto">{t("autoLanguage")}</option>
          {LANGUAGES.map(code => <option key={code} value={code} lang={code}>{languageNames[code]}</option>)}
        </select>
        {choice.languageAuto && <span className="language-hint" role="status">
          {choice.languageDetected ? `${languageNames[choice.language]} · ${t("languageDetected")}`
            : (choice.languageAttempts ?? 0) >= 3 ? t("chooseLanguage") : t("detectOnSpeech")}
        </span>}
      </div>)}
  </div>;
}
