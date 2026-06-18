"use client";

import { useT } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang } = useT();
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold" role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => setLang("ja")}
        aria-pressed={lang === "ja"}
        className={`px-2.5 py-1 transition ${lang === "ja" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
      >
        日本語
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`px-2.5 py-1 transition ${lang === "en" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
      >
        EN
      </button>
    </div>
  );
}
