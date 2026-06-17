"use client";

import { useEffect, useState } from "react";
import { useUI } from "@/components/ui/toast";

type DraftType = "interview" | "result" | "enrollment";
interface DraftLang { subject: string; body: string; }
interface Drafts { ja: DraftLang; zh: DraftLang; en: DraftLang; }
type Lang = "ja" | "zh" | "en";

const TYPE_LABEL: Record<DraftType, string> = {
  interview: "面接案内",
  result: "選考結果",
  enrollment: "入学手続き",
};
const LANG_LABEL: Record<Lang, string> = { ja: "日本語", zh: "中文", en: "English" };

function defaultType(status: string): DraftType {
  if (["合格", "不合格", "補欠合格", "保留"].includes(status)) return "result";
  if (status === "結果待ち") return "result";
  return "interview";
}

export function EmailDraftCard({ applicationId, status }: { applicationId: string; status: string }) {
  const { toast } = useUI();
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [type, setType] = useState<DraftType>(defaultType(status));
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [lang, setLang] = useState<Lang>("ja");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${applicationId}/draft-email`)
      .then((r) => (r.ok ? r.json() : { aiEnabled: false }))
      .then((d) => { if (!cancelled) setAiEnabled(!!d.aiEnabled); })
      .catch(() => { if (!cancelled) setAiEnabled(false); });
    return () => { cancelled = true; };
  }, [applicationId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/draft-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "生成に失敗しました");
      setDrafts(d.drafts);
      setLang("ja");
      toast("メール下書きを生成しました", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "生成に失敗しました", "error");
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what}をコピーしました`, "success");
    } catch {
      toast("コピーできませんでした", "error");
    }
  };

  if (aiEnabled === null) return null; // 状態取得中は出さない（チラつき防止）

  const cur = drafts?.[lang];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide">AIメール下書き（日/中/英）</h3>
        {!aiEnabled && <span className="text-[11px] text-gray-400">未設定（ANTHROPIC_API_KEY）</span>}
      </div>

      {!aiEnabled ? (
        <p className="text-xs text-gray-400">
          ANTHROPIC_API_KEY を設定すると、申請者状態に応じた敬語メール（日本語）と中文/英文版の下書きを生成できます。
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DraftType)}
              className="form-input text-sm w-auto"
              aria-label="メール種別"
            >
              {(Object.keys(TYPE_LABEL) as DraftType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={generating}
              className="text-xs bg-navy-800 text-white px-3 py-1.5 rounded-lg hover:bg-navy-700 disabled:opacity-50"
            >
              {generating ? "生成中..." : drafts ? "再生成" : "下書きを生成"}
            </button>
          </div>

          {!drafts ? (
            <p className="text-xs text-gray-400">
              種別を選んで生成 → 内容を確認・修正してから送信してください。判明している情報のみ使用します（日時・金額等は創作しません）。
            </p>
          ) : (
            <div className="space-y-2">
              {/* 言語タブ */}
              <div className="flex gap-1">
                {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${lang === l ? "bg-navy-800 text-white border-navy-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                  >
                    {LANG_LABEL[l]}
                  </button>
                ))}
              </div>

              {cur && (
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-gray-500">件名</label>
                      <button onClick={() => copy(cur.subject, "件名")} className="text-[11px] text-navy-600 hover:underline">コピー</button>
                    </div>
                    <input readOnly value={cur.subject} className="form-input text-sm w-full bg-gray-50" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-gray-500">本文</label>
                      <button onClick={() => copy(cur.body, "本文")} className="text-[11px] text-navy-600 hover:underline">コピー</button>
                    </div>
                    <textarea
                      readOnly
                      value={cur.body}
                      rows={10}
                      className="form-input text-sm w-full bg-gray-50 leading-relaxed resize-y"
                    />
                  </div>
                </div>
              )}

              <p className="text-[11px] text-amber-700">
                ※ AI生成の下書きです。誤りが含まれる場合があります。送信前に必ず内容を確認してください。
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
