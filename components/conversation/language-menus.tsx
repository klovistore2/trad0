"use client";
import { type Language } from "@/types/session";
import { translator } from "@/lib/i18n/strings";
import { languageLabel, languageOptions } from "@/lib/i18n/language-names";

type Choice = { language: Language; languageAuto: boolean; languageDetected?: boolean; languageAttempts?: number };
export function LanguageMenus({ mine, theirs, locale = "en", disabled = false, onMine, onTheirs }: {
  mine: Choice; theirs: Choice; locale?: Language; disabled?: boolean;
  onMine: (language: Language | "auto") => void;
  onTheirs: (language: Language | "auto") => void;
}) {
  const t = translator(locale);
  // Names are shown in the reader's own language: a menu is useless in a script you cannot read.
  const options = languageOptions(locale);
  return <div className="language-menus">
    {([{ id: "my-language", label: t("iSpeak"), choice: mine, change: onMine },
      { id: "peer-language", label: t("theySpeak"), choice: theirs, change: onTheirs }]).map(({ id, label, choice, change }) =>
      <div className="language-choice" key={id}>
        <label htmlFor={id}>{label}</label>
        <select id={id} className="language-picker" disabled={disabled}
          value={choice.languageAuto && !choice.languageDetected ? "auto" : choice.language}
          onChange={event => change(event.target.value as Language | "auto")}>
          {/* Auto stays selected only while nothing has been heard: once the transcription
              names a language, the menu shows it, and the hint says it came from detection. */}
          <option value="auto">{t("autoLanguage")}</option>
          {options.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
        </select>
        {choice.languageAuto && <span className="language-hint" role="status">
          {choice.languageDetected ? `${languageLabel(choice.language, locale)} · ${t("languageDetected")}`
            : (choice.languageAttempts ?? 0) >= 3 ? t("chooseLanguage") : t("detectOnSpeech")}
        </span>}
      </div>)}
  </div>;
}
