"use client";

import { useEffect, useMemo, useState } from "react";
import { getStatusStyle } from "@/lib/utils";
import { InterviewFeedbackCard } from "@/components/admin/InterviewFeedbackCard";
import { SkeletonList } from "@/components/ui/skeleton";

interface SchoolChoice { priority: number; schoolName: string; department: string; }
interface FeedbackBrief { recommendation: string; scoreOverall: number | null; }
interface Candidate {
  id: string;
  applicationNo: string;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  nationality: string;
  birthDate: string;
  japaneseLevel: string;
  schoolName: string;
  department: string;
  applicationReason: string;
  lastSchoolName: string;
  interviewDate: string | null;
  interviewTime: string | null;
  interviewPlace: string | null;
  status: string;
  createdAt: string;
  applicationSchools: SchoolChoice[];
  interviewFeedbacks: FeedbackBrief[];
}

const REC_DOT: Record<string, string> = {
  合格推薦: "bg-green-500",
  不合格推薦: "bg-red-500",
  保留: "bg-yellow-400",
};

function feedbackSummary(fbs: FeedbackBrief[]) {
  if (fbs.length === 0) return null;
  const scored = fbs.filter((f) => f.scoreOverall);
  const avg = scored.length > 0
    ? (scored.reduce((s, f) => s + (f.scoreOverall || 0), 0) / scored.length).toFixed(1)
    : null;
  return { count: fbs.length, avg };
}

export default function InterviewsPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("すべて");
  const [selected, setSelected] = useState<Candidate | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/interview-candidates");
        if (!res.ok) throw new Error("候補者の取得に失敗しました");
        const d = await res.json();
        setCandidates(Array.isArray(d) ? d : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラー");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => set.add(c.status));
    return ["すべて", ...Array.from(set)];
  }, [candidates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => {
      if (statusFilter !== "すべて" && c.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${c.lastName}${c.firstName} ${c.lastNameKana}${c.firstNameKana} ${c.applicationNo} ${c.schoolName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, query, statusFilter]);

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title">面接レビュー</h1>
          <p className="wsdb-topbar-meta">候補者を選び、面接の評価とフィードバックを記入してください</p>
        </div>
      </div>

      {error ? (
        <div className="card text-center py-8 text-red-600">{error}</div>
      ) : loading ? (
        <SkeletonList rows={8} cols={3} />
      ) : (
        <>
          {/* 検索・絞り込み */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="氏名・カナ・受付番号で検索"
                className="form-input text-sm w-full pl-9"
                aria-label="候補者を検索"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input text-sm w-auto"
              aria-label="ステータスで絞り込み"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s === "すべて" ? "すべてのステータス" : s}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} 名</span>
          </div>

          {/* 候補者一覧 */}
          {filtered.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              <p className="text-2xl mb-2">🗂️</p>
              <p className="text-sm">該当する候補者がいません</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((c) => {
                const sum = feedbackSummary(c.interviewFeedbacks);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="text-left bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-navy-300 transition-all p-4 focus:outline-none focus:ring-2 focus:ring-navy-400"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{c.lastName} {c.firstName}</p>
                        <p className="text-xs text-gray-400 truncate">{c.lastNameKana} {c.firstNameKana}</p>
                      </div>
                      <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold ${getStatusStyle(c.status)}`}>
                        {c.status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 truncate mb-1">
                      <span className="text-gray-400">志望校</span> {c.schoolName}
                      {c.department ? `／${c.department}` : ""}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{c.japaneseLevel}</span>
                      <span className="truncate">
                        {c.interviewDate ? `面接 ${c.interviewDate}${c.interviewTime ? " " + c.interviewTime : ""}` : "面接日未設定"}
                      </span>
                    </div>

                    {/* フィードバック状況 */}
                    <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                      {sum ? (
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-1">
                            {c.interviewFeedbacks.slice(0, 4).map((f, i) => (
                              <span key={i} className={`w-2.5 h-2.5 rounded-full ring-2 ring-white ${REC_DOT[f.recommendation] || "bg-gray-300"}`} />
                            ))}
                          </div>
                          <span className="text-xs text-gray-500">
                            レビュー {sum.count} 件{sum.avg ? ` ・ 総合 ${sum.avg}` : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">未レビュー</span>
                      )}
                      <span className="text-xs text-navy-600 font-medium">記入する →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* レビュー記入モーダル */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-gray-900">{selected.lastName} {selected.firstName}</h2>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getStatusStyle(selected.status)}`}>
                    {selected.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selected.lastNameKana} {selected.firstNameKana} ・ 受付番号 {selected.applicationNo}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 text-gray-400 hover:text-gray-700 text-xl leading-none p-1"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            {/* 候補者情報（閲覧のみ） */}
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Info label="国籍" value={selected.nationality} />
                <Info label="生年月日" value={selected.birthDate} />
                <Info label="日本語レベル" value={selected.japaneseLevel} />
                <Info label="最終学歴" value={selected.lastSchoolName} />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">志望校</p>
                <div className="space-y-1">
                  {(selected.applicationSchools.length > 0
                    ? selected.applicationSchools
                    : [{ priority: 1, schoolName: selected.schoolName, department: selected.department }]
                  ).map((s) => (
                    <div key={s.priority} className="flex items-center gap-2 text-sm">
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-navy-100 text-navy-700 font-medium">
                        第{s.priority}志望
                      </span>
                      <span className="text-gray-800">{s.schoolName}{s.department ? `／${s.department}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selected.applicationReason && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">志望動機</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {selected.applicationReason}
                  </p>
                </div>
              )}

              {(selected.interviewDate || selected.interviewPlace) && (
                <div className="text-sm text-gray-600">
                  <span className="text-xs font-semibold text-gray-500">面接 </span>
                  {selected.interviewDate || "日付未設定"}
                  {selected.interviewTime ? ` ${selected.interviewTime}` : ""}
                  {selected.interviewPlace ? ` ・ ${selected.interviewPlace}` : ""}
                </div>
              )}
            </div>

            {/* 面接フィードバック記入 */}
            <div className="px-5 pb-5">
              <InterviewFeedbackCard applicationId={selected.id} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-gray-800 font-medium truncate">{value || "—"}</p>
    </div>
  );
}
