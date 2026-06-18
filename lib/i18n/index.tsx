"use client";

// 出願ポータルの軽量 i18n。
//  - 既定は日本語(ja)。t(ja) は ja のときソース文字列をそのまま返す＝挙動非破壊。
//  - en のとき EN 辞書を引き、未訳はソース(日本語)にフォールバック（壊れない）。
//  - 言語は ?lang=en / localStorage("applyLang") で初期化、切替はクライアントのみ。
import { createContext, useContext, useEffect, useState } from "react";
import { EN } from "./en";

export type Lang = "ja" | "en";

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (ja: string) => string;
}

const Ctx = createContext<I18nCtx>({ lang: "ja", setLang: () => {}, t: (ja) => ja });

function pick(v: string | null): Lang | null {
  return v === "ja" || v === "en" ? v : null;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ja");

  useEffect(() => {
    try {
      const q = pick(new URLSearchParams(window.location.search).get("lang"));
      const stored = pick(localStorage.getItem("applyLang"));
      setLangState(q ?? stored ?? "ja");
    } catch {
      /* SSR / no window */
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("applyLang", l); } catch { /* ignore */ }
  };

  const t = (ja: string) => (lang === "en" ? EN[ja] ?? ja : ja);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useT(): I18nCtx {
  return useContext(Ctx);
}
