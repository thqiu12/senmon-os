"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonList } from "@/components/ui/skeleton";

interface ForecastRow {
  schoolName: string; department: string; enrollmentYear: string;
  total: number; pipeline: number; accepted: number; waitlist: number; hold: number; rejected: number; enrolled: number;
  quota: number | null; acceptRate: number | null; enrollRate: number | null;
  projectedEnrolled: number; fillNow: number | null; projectedFill: number | null;
}
interface ChannelRow {
  agentId: string | null; agentName: string; total: number; accepted: number;
  acceptRate: number | null; declineRate: number; docIssueRate: number; templateRate: number;
}
interface Group { label: string; count: number; detail: string; }
interface Anomalies {
  duplicatePeople: Group[]; sameEmail: Group[]; samePhone: Group[]; sameAddress: Group[]; reusedEssays: Group[];
}
interface RiskRow {
  id: string; applicationNo: string; name: string; school: string; department: string;
  score: number; level: string; factors: string[];
}
interface Data {
  generatedAt: string; totalApplications: number;
  forecast: ForecastRow[]; channels: ChannelRow[]; anomalies: Anomalies; declineRisk: RiskRow[];
}

type Tab = "forecast" | "channels" | "anomalies" | "decline";
const num = "tabular-nums";

function pct(v: number | null) { return v == null ? "—" : `${v}%`; }
function fillStyle(v: number | null) {
  if (v == null) return "text-gray-400";
  if (v >= 100) return "text-green-700 font-bold";
  if (v >= 70) return "text-amber-700 font-semibold";
  return "text-gray-700";
}
function rateBad(v: number, warn: number, bad: number) {
  if (v >= bad) return "text-red-700 font-bold";
  if (v >= warn) return "text-amber-700 font-semibold";
  return "text-gray-600";
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("forecast");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/analytics");
        if (!res.ok) throw new Error("分析の取得に失敗しました");
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラー");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const TABS: { key: Tab; label: string }[] = [
    { key: "forecast", label: "入学予測・漏斗" },
    { key: "decline", label: "辞退リスク" },
    { key: "channels", label: "チャネル品質" },
    { key: "anomalies", label: "重複・異常" },
  ];

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title">分析・予測</h1>
          <p className="wsdb-topbar-meta">
            出願データから自動集計（0 token・統計のみ）{data ? ` ｜ 対象 ${data.totalApplications} 件` : ""}
          </p>
        </div>
      </div>

      {error ? (
        <div className="card text-center py-8 text-red-600">{error}</div>
      ) : loading ? (
        <SkeletonList rows={8} cols={5} />
      ) : data ? (
        <>
          <div className="flex gap-1 mb-4 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-sm px-4 py-2 rounded-lg border ${tab === t.key ? "bg-navy-800 text-white border-navy-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* === 入学予測・漏斗 === */}
          {tab === "forecast" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-navy-800 text-white text-xs">
                  <tr>
                    <th className="text-left px-3 py-2.5">志望校・学科</th>
                    <th className="px-3 py-2.5">年度</th>
                    <th className="px-3 py-2.5">出願</th>
                    <th className="px-3 py-2.5">選考中</th>
                    <th className="px-3 py-2.5">合格</th>
                    <th className="px-3 py-2.5">手続完了</th>
                    <th className="px-3 py-2.5">概算最終</th>
                    <th className="px-3 py-2.5">定員</th>
                    <th className="px-3 py-2.5">充足見込</th>
                    <th className="px-3 py-2.5">合格率/入学率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.forecast.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{r.schoolName}<span className="text-gray-400 text-xs"> / {r.department}</span></td>
                      <td className={`px-3 py-2 text-center text-gray-500 ${num}`}>{r.enrollmentYear}</td>
                      <td className={`px-3 py-2 text-center ${num}`}>{r.total}</td>
                      <td className={`px-3 py-2 text-center text-indigo-700 ${num}`}>{r.pipeline}</td>
                      <td className={`px-3 py-2 text-center text-green-700 font-semibold ${num}`}>{r.accepted}</td>
                      <td className={`px-3 py-2 text-center ${num}`}>{r.enrolled}</td>
                      <td className={`px-3 py-2 text-center text-navy-700 font-bold ${num}`}>{r.projectedEnrolled}</td>
                      <td className={`px-3 py-2 text-center text-gray-500 ${num}`}>{r.quota ?? "—"}</td>
                      <td className={`px-3 py-2 text-center ${num} ${fillStyle(r.projectedFill)}`}>{pct(r.projectedFill)}</td>
                      <td className={`px-3 py-2 text-center text-xs text-gray-400 ${num}`}>{pct(r.acceptRate)} / {pct(r.enrollRate)}</td>
                    </tr>
                  ))}
                  {data.forecast.length === 0 && (
                    <tr><td colSpan={10} className="text-center text-gray-400 py-6">データがありません</td></tr>
                  )}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400 px-3 py-2">
                ※「概算最終」は観測された合格率・入学率(合格→手続完了)に基づく参考値です。データが少ない時期は精度が低くなります。
              </p>
            </div>
          )}

          {/* === チャネル品質 === */}
          {tab === "channels" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-navy-800 text-white text-xs">
                  <tr>
                    <th className="text-left px-3 py-2.5">エージェント</th>
                    <th className="px-3 py-2.5">件数</th>
                    <th className="px-3 py-2.5">合格</th>
                    <th className="px-3 py-2.5">合格率</th>
                    <th className="px-3 py-2.5">辞退率</th>
                    <th className="px-3 py-2.5">書類不備率</th>
                    <th className="px-3 py-2.5">模板化率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.channels.map((c) => (
                    <tr key={c.agentId ?? "direct"} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{c.agentName}</td>
                      <td className={`px-3 py-2 text-center ${num}`}>{c.total}</td>
                      <td className={`px-3 py-2 text-center text-gray-600 ${num}`}>{c.accepted}</td>
                      <td className={`px-3 py-2 text-center ${num}`}>{pct(c.acceptRate)}</td>
                      <td className={`px-3 py-2 text-center ${num} ${rateBad(c.declineRate, 20, 40)}`}>{pct(c.declineRate)}</td>
                      <td className={`px-3 py-2 text-center ${num} ${rateBad(c.docIssueRate, 20, 40)}`}>{pct(c.docIssueRate)}</td>
                      <td className={`px-3 py-2 text-center ${num} ${rateBad(c.templateRate, 30, 60)}`}>{pct(c.templateRate)}</td>
                    </tr>
                  ))}
                  {data.channels.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-gray-400 py-6">データがありません</td></tr>
                  )}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400 px-3 py-2">
                ※「模板化率」= 同一エージェント内で志望動機がほぼ同一の割合。高いほど使い回しの疑い。書類不備率=差し戻しのあった申請の割合。
              </p>
            </div>
          )}

          {/* === 重複・異常 === */}
          {tab === "anomalies" && (
            <div className="space-y-4">
              <AnomalyBlock title="同一人物の可能性（氏名+生年月日）" hint="併願・二重出願の可能性" groups={data.anomalies.duplicatePeople} />
              <AnomalyBlock title="同一メールアドレス" groups={data.anomalies.sameEmail} />
              <AnomalyBlock title="同一電話番号" groups={data.anomalies.samePhone} />
              <AnomalyBlock title="同一住所" groups={data.anomalies.sameAddress} />
              <AnomalyBlock title="志望動機の使い回し" hint="異なる申請者で同一文面" groups={data.anomalies.reusedEssays} />
            </div>
          )}

          {/* === 辞退リスク（要フォロー） === */}
          {tab === "decline" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700">要フォロー（合格・補欠合格で未入学）</span>
                <span className="text-xs text-gray-400">{data.declineRisk.length} 名</span>
              </div>
              {data.declineRisk.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm">辞退リスクの高い対象はいません</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.declineRisk.map((r) => (
                    <li key={r.id}>
                      <Link href={`/admin/applications/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                        <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-bold ${r.level === "高" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{r.level}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.name}<span className="text-xs text-gray-400"> / {r.school}{r.department ? "・" + r.department : ""}</span></p>
                          <p className="text-xs text-gray-500 truncate">{r.factors.join(" ・ ")}</p>
                        </div>
                        <span className="shrink-0 text-xs text-gray-400 tabular-nums">{r.applicationNo}</span>
                        <span className="shrink-0 text-navy-600 text-xs">開く →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-gray-400 px-3 py-2">
                ※ スコアは規則ベースの目安（手続き未着手/期限/補欠/併願/エージェント辞退率）。優先追客の参考にしてください。
              </p>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

function AnomalyBlock({ title, hint, groups }: { title: string; hint?: string; groups: Group[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-700">{title}{hint && <span className="text-xs text-gray-400 font-normal ml-2">{hint}</span>}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${groups.length > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"}`}>
          {groups.length > 0 ? `${groups.length} 件` : "なし"}
        </span>
      </div>
      {groups.length > 0 && (
        <ul className="divide-y divide-gray-50">
          {groups.map((g, i) => (
            <li key={i} className="px-4 py-2 flex items-start gap-3 text-sm">
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold tabular-nums">×{g.count}</span>
              <div className="min-w-0">
                <p className="text-gray-800 break-words">{g.label}</p>
                <p className="text-xs text-gray-400 break-words">{g.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
