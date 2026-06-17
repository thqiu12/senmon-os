"use client";

import { useEffect, useState } from "react";
import { useUI } from "@/components/ui/toast";

type Level = "ok" | "warn" | "error";
interface CheckItem { key: string; label: string; level: Level; message: string; }
interface Extraction {
  documentType?: string | null;
  fullNameRoman?: string | null;
  fullNameKanji?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
  residenceStatus?: string | null;
  residenceExpiry?: string | null;
  documentExpiry?: string | null;
  schoolName?: string | null;
  graduationDate?: string | null;
  readable?: boolean;
  notes?: string | null;
}
interface DocRow {
  id: string;
  docType: string;
  mimeType: string;
  originalName: string;
  status: string;
  aiExtractedAt: string | null;
  aiModel: string | null;
  extraction: Extraction | null;
  comparison: CheckItem[];
}
interface CheckData { aiEnabled: boolean; rules: CheckItem[]; documents: DocRow[]; }

const LEVEL_STYLE: Record<Level, { dot: string; text: string; chip: string }> = {
  ok:    { dot: "bg-green-500",  text: "text-gray-600",  chip: "bg-green-50 text-green-700 border-green-200" },
  warn:  { dot: "bg-amber-500",  text: "text-amber-700", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  error: { dot: "bg-red-500",    text: "text-red-700",   chip: "bg-red-50 text-red-700 border-red-200" },
};

const EXTRACT_FIELDS: { key: keyof Extraction; label: string }[] = [
  { key: "documentType", label: "書類種別" },
  { key: "fullNameRoman", label: "氏名(ローマ字)" },
  { key: "fullNameKanji", label: "氏名(漢字)" },
  { key: "birthDate", label: "生年月日" },
  { key: "nationality", label: "国籍" },
  { key: "residenceStatus", label: "在留資格" },
  { key: "residenceExpiry", label: "在留期限" },
  { key: "documentExpiry", label: "書類有効期限" },
  { key: "schoolName", label: "学校名" },
  { key: "graduationDate", label: "卒業年月日" },
];

function Dot({ level }: { level: Level }) {
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${LEVEL_STYLE[level].dot}`} />;
}

export function DocCheckCard({ applicationId }: { applicationId: string }) {
  const { toast } = useUI();
  const [data, setData] = useState<CheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${applicationId}/doc-check`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applicationId]);

  const runExtract = async (documentId: string) => {
    setExtracting(documentId);
    try {
      const res = await fetch(`/api/applications/${applicationId}/doc-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "AI照合に失敗しました");
      setData((prev) => prev && {
        ...prev,
        documents: prev.documents.map((doc) =>
          doc.id === documentId
            ? { ...doc, extraction: d.extraction, comparison: d.comparison, aiExtractedAt: new Date().toISOString(), aiModel: "claude-haiku-4-5" }
            : doc,
        ),
      });
      toast("AI照合が完了しました", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI照合に失敗しました", "error");
    } finally {
      setExtracting(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p className="text-xs text-gray-400 text-center py-3">書類チェックを読み込み中...</p>
      </div>
    );
  }
  if (!data) return null;

  const errors = data.rules.filter((r) => r.level === "error").length;
  const warns = data.rules.filter((r) => r.level === "warn").length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide">書類チェック（自動）</h3>
        {errors > 0 ? (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${LEVEL_STYLE.error.chip}`}>要対応 {errors}件</span>
        ) : warns > 0 ? (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${LEVEL_STYLE.warn.chip}`}>確認 {warns}件</span>
        ) : (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${LEVEL_STYLE.ok.chip}`}>問題なし</span>
        )}
      </div>

      {/* ルール結果（0 token） */}
      <ul className="space-y-1.5 mb-1">
        {data.rules.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-sm">
            <Dot level={r.level} />
            <span className="font-medium text-gray-700">{r.label}</span>
            <span className={`text-xs ${LEVEL_STYLE[r.level].text}`}>— {r.message}</span>
          </li>
        ))}
        {data.rules.length === 0 && (
          <li className="text-xs text-gray-400">チェック対象の必須書類がありません</li>
        )}
      </ul>

      {/* AI照合（Haiku vision・任意） */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500">AI照合（書類⇄フォーム）</p>
          {!data.aiEnabled && (
            <span className="text-[11px] text-gray-400">未設定（ANTHROPIC_API_KEY）</span>
          )}
        </div>

        {data.documents.length === 0 ? (
          <p className="text-xs text-gray-400">書類がありません</p>
        ) : (
          <div className="space-y-2">
            {data.documents.map((doc) => (
              <div key={doc.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-800">{doc.docType}</span>
                    <span className="text-xs text-gray-400 ml-2 truncate">{doc.originalName}</span>
                  </div>
                  {data.aiEnabled && (
                    <button
                      onClick={() => runExtract(doc.id)}
                      disabled={extracting === doc.id}
                      className="shrink-0 text-xs bg-navy-800 text-white px-3 py-1.5 rounded-lg hover:bg-navy-700 disabled:opacity-50"
                    >
                      {extracting === doc.id ? "照合中..." : doc.extraction ? "再照合" : "AIで照合"}
                    </button>
                  )}
                </div>

                {doc.extraction && (
                  <div className="mt-3 space-y-2">
                    {/* 照合結果 */}
                    {doc.comparison.length > 0 && (
                      <ul className="space-y-1">
                        {doc.comparison.map((c) => (
                          <li key={c.key} className="flex items-center gap-2 text-xs">
                            <Dot level={c.level} />
                            <span className="font-medium text-gray-700">{c.label}</span>
                            <span className={LEVEL_STYLE[c.level].text}>— {c.message}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* 抽出値（目視用） */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 bg-gray-50 rounded-lg p-2">
                      {EXTRACT_FIELDS.filter((f) => doc.extraction?.[f.key]).map((f) => (
                        <div key={f.key} className="text-xs min-w-0">
                          <span className="text-gray-400">{f.label}: </span>
                          <span className="text-gray-800">{String(doc.extraction?.[f.key])}</span>
                        </div>
                      ))}
                    </div>
                    {doc.extraction.readable === false && (
                      <p className="text-xs text-amber-700">⚠️ 画像が不鮮明で読み取れない可能性があります{doc.extraction.notes ? `（${doc.extraction.notes}）` : ""}</p>
                    )}
                    {doc.aiExtractedAt && (
                      <p className="text-[11px] text-gray-400">照合日時: {new Date(doc.aiExtractedAt).toLocaleString("ja-JP")}（{doc.aiModel || "AI"}）</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-400">
          ※ 氏名・国籍は表記揺れがあるため自動判定せず抽出値のみ表示します。生年月日・在留期限・在留資格は自動照合します。
        </p>
      </div>
    </div>
  );
}
