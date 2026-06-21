"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CompassMark } from "@/components/ui/CompassMark";

const SCHOOLS = [
  {
    id: "chuo-seminar",
    name: "中央ゼミナール",
    hojin: "学校法人 羽場学園",
    icon: "book" as const,
    color: { header: "bg-gradient-to-br from-blue-500 to-blue-700", btn: "bg-blue-600 hover:bg-blue-700", tag: "bg-blue-50 text-blue-700 border-blue-100", badge: "bg-blue-100 text-blue-700", closed: "bg-gray-100 text-gray-400 cursor-not-allowed" },
    desc: "大学・大学院・美術系の受験指導に特化した専修学校。留学生向けの日本語指導から難関大学合格まで、個別カリキュラムで徹底サポートします。",
    departments: [
      { name: "大学・大学院受験科", duration: "1年制" },
      { name: "美術系受験科", duration: "1年制" },
    ],
  },
  {
    id: "tdb",
    name: "東京デジタルビジネス専門学校",
    nameShort: "TDB",
    hojin: "学校法人 羽場学園",
    icon: "monitor" as const,
    color: { header: "bg-gradient-to-br from-violet-500 to-violet-700", btn: "bg-violet-600 hover:bg-violet-700", tag: "bg-violet-50 text-violet-700 border-violet-100", badge: "bg-violet-100 text-violet-700", closed: "bg-gray-100 text-gray-400 cursor-not-allowed" },
    desc: "デジタルビジネス・デジタルメディアの実践スキルを習得する専門学校。最新テクノロジーとビジネスを融合した教育で、デジタル社会を牽引する人材を育成します。",
    departments: [
      { name: "デジタルビジネス科", duration: "2年制" },
      { name: "中国語デジタルビジネス科", duration: "2年制" },
    ],
  },
  {
    id: "kanagawa-judo",
    name: "神奈川柔整鍼灸専門学校",
    hojin: "学校法人 平井学園",
    icon: "stethoscope" as const,
    color: { header: "bg-gradient-to-br from-emerald-500 to-emerald-700", btn: "bg-emerald-600 hover:bg-emerald-700", tag: "bg-emerald-50 text-emerald-700 border-emerald-100", badge: "bg-emerald-100 text-emerald-700", closed: "bg-gray-100 text-gray-400 cursor-not-allowed" },
    desc: "柔道整復師・鍼灸師の国家資格取得を目指す専門学校。豊富な臨床実習と国家試験対策で、医療・スポーツ分野で活躍できる人材を育成します。",
    departments: [
      { name: "柔道整復師科", duration: "3年制" },
      { name: "鍼灸師科", duration: "3年制" },
      { name: "柔道整復師・鍼灸師ダブルライセンス科", duration: "3年制" },
      { name: "大学進学科", duration: "1年制" },
    ],
  },
];

const STEPS = [
  { n: 1, label: "個人情報",   sub: "氏名・連絡先・住所",    grad: "from-blue-500 to-blue-600",       chipText: "text-blue-700",    chipBg: "bg-blue-50 ring-blue-200" },
  { n: 2, label: "志望校選択", sub: "学校・学科・コース",    grad: "from-indigo-500 to-indigo-600",   chipText: "text-indigo-700",  chipBg: "bg-indigo-50 ring-indigo-200" },
  { n: 3, label: "書類提出",   sub: "成績・語学証明 等",      grad: "from-violet-500 to-violet-600",   chipText: "text-violet-700",  chipBg: "bg-violet-50 ring-violet-200" },
  { n: 4, label: "選考費支払", sub: "¥20,000〜",              grad: "from-pink-500 to-rose-600",       chipText: "text-rose-700",    chipBg: "bg-rose-50 ring-rose-200" },
  { n: 5, label: "確認・提出", sub: "内容確認後に送信",        grad: "from-emerald-500 to-emerald-600", chipText: "text-emerald-700", chipBg: "bg-emerald-50 ring-emerald-200" },
];

/** STEPS のフローアイコン。SVG で統一感を出す。 */
function StepIcon({ n, className = "w-7 h-7" }: { n: number; className?: string }) {
  const common = { className, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };
  switch (n) {
    case 1: // 個人情報
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      );
    case 2: // 志望校（学校建物）
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M5 21V10l7-5 7 5v11" />
          <path d="M10 21v-6h4v6" />
          <path d="M9 11h.01M15 11h.01" />
        </svg>
      );
    case 3: // 書類
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h6M9 9h2" />
        </svg>
      );
    case 4: // 円マーク（支払い）
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 8l4 5 4-5" />
          <path d="M8 13h8M8 16h8M12 13v5" />
        </svg>
      );
    case 5: // チェック
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l3 3 5-6" />
        </svg>
      );
    default:
      return null;
  }
}

function InfoIcon({ kind, className = "w-5 h-5" }: { kind: "tag" | "doc" | "yen"; className?: string }) {
  const common = { className, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };
  if (kind === "tag")
    return (
      <svg {...common}>
        <path d="M20 12l-8 8a2 2 0 0 1-2.8 0L3 13.8V4h9.8L20 11.2a.5.5 0 0 1 0 .8z" />
        <circle cx="8" cy="9" r="1.5" />
      </svg>
    );
  if (kind === "doc")
    return (
      <svg {...common}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    );
  // yen
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 8l4 5 4-5" />
      <path d="M8 13h8M8 16h8M12 13v5" />
    </svg>
  );
}

const durationColor: Record<string, string> = {
  "1年制": "bg-blue-100 text-blue-700",
  "2年制": "bg-purple-100 text-purple-700",
  "3年制": "bg-orange-100 text-orange-700",
};

interface ActiveCohort {
  id: string;
  name: string;
  year: number;
  round: number;
  schoolKey: string | null;
  acceptStart: string | null;
  acceptEnd: string | null;
  examDate: string | null;
  deadline: string | null;
  upcoming?: boolean; // includeUpcoming=1 のとき: true=次回(受付開始が未来) / false=受付中
}

export default function HomePage() {
  const [activeCohorts, setActiveCohorts] = useState<ActiveCohort[] | null>(null);

  useEffect(() => {
    fetch("/api/apply/cohorts?includeUpcoming=1")
      .then(r => r.json())
      .then(d => setActiveCohorts(Array.isArray(d) ? d : []))
      .catch(() => setActiveCohorts([]));
  }, []);

  // 学校が受付中かどうか、受付中のバッチ情報を返す（次回=upcoming は除外）
  const getSchoolCohort = (schoolId: string): ActiveCohort | null => {
    if (!activeCohorts) return null;
    const pool = activeCohorts.filter(c => !c.upcoming);
    // 学校専用バッチ優先、次に全校共通バッチ
    const specific = pool.find(c => c.schoolKey === schoolId);
    if (specific) return specific;
    const global = pool.find(c => !c.schoolKey);
    return global || null;
  };

  // 受付期間外でも、次回（受付開始が未来）の回次があれば最も近いものを返す
  const getUpcomingCohort = (schoolId: string): ActiveCohort | null => {
    if (!activeCohorts) return null;
    const pool = activeCohorts
      .filter(c => c.upcoming && c.acceptStart && (c.schoolKey === schoolId || !c.schoolKey))
      .sort((a, b) => new Date(a.acceptStart!).getTime() - new Date(b.acceptStart!).getTime());
    return pool[0] || null;
  };

  const isAccepting = (schoolId: string) => getSchoolCohort(schoolId) !== null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm"><CompassMark className="w-5 h-5" /></div>
            <div>
              <p className="font-bold text-gray-800 text-sm leading-none">Compass</p>
              <p className="text-xs text-gray-400 mt-0.5">入学出願システム</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/apply/status"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="hidden sm:inline">出願の続き・状況確認</span>
              <span className="sm:hidden">続き / 状況</span>
            </Link>
            <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg transition">管理者</Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-[#2c5a82]">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-16 text-white/[0.06] hidden md:block">
            <CompassMark className="w-[24rem] h-[24rem]" />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_-10%,rgba(96,165,250,0.22),transparent_42%)]" />
          <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-20 sm:pt-20 sm:pb-24">
            <div className="max-w-2xl reveal-up">
              <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-blue-100 bg-white/10 ring-1 ring-white/15 px-3 py-1 rounded-full mb-5 backdrop-blur-sm">
                <CompassMark className="w-3.5 h-3.5" />
                Compass オンライン出願
              </span>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight tracking-tight mb-4">
                入学願書 オンライン出願
              </h1>
              <p className="text-blue-100/80 text-base sm:text-lg leading-relaxed max-w-xl mb-8">
                24時間いつでもオンラインで出願手続きができます。必要書類もデジタルでご提出いただけます。
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a href="#schools" className="inline-flex items-center gap-2 bg-white text-navy-900 font-bold text-sm px-5 py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-150 active:scale-[0.98]">
                  志望校を選んで出願
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
                </a>
                <Link href="/apply/status" className="inline-flex items-center gap-2 text-blue-50 font-semibold text-sm px-5 py-3 rounded-xl ring-1 ring-white/25 hover:bg-white/10 transition active:scale-[0.98]">
                  出願の続き・状況確認
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">

          {/* 学校カード */}
          <section id="schools" className="scroll-mt-24">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mb-1">志望校を選んで出願する</h2>
            <p className="text-sm text-gray-500 mb-6">受付中の学校から、オンラインで願書を提出できます。</p>

            {/* 受付状況ロード中 */}
            {activeCohorts === null && (
              <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                受付状況を確認中...
              </div>
            )}

            {activeCohorts !== null && (
              <div className="grid md:grid-cols-3 gap-5">
                {SCHOOLS.map((school, i) => {
                  const cohort = getSchoolCohort(school.id);
                  const accepting = cohort !== null;
                  const upcoming = !accepting ? getUpcomingCohort(school.id) : null;

                  return (
                    <div key={school.id}
                      style={{ "--reveal-delay": `${i * 90}ms` } as CSSProperties}
                      className={`reveal-up bg-white rounded-2xl border shadow-sm transition-all duration-200 overflow-hidden flex flex-col ${accepting ? "border-gray-200 hover:shadow-lg hover:-translate-y-1" : "border-gray-100 opacity-80"}`}>
                      {/* カラーヘッダー */}
                      <div className={`${school.color.header} px-5 py-5 relative`}>
                        {/* 受付状況バッジ */}
                        <div className="absolute top-3 right-3">
                          {accepting ? (
                            <span className="flex items-center gap-1 text-xs font-bold bg-white/20 text-white px-2.5 py-1 rounded-full backdrop-blur-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse inline-block"></span>
                              第{cohort!.round}期 受付中
                            </span>
                          ) : upcoming ? (
                            <span className="text-xs font-bold bg-white/25 text-white px-2.5 py-1 rounded-full backdrop-blur-sm">
                              受付開始予定
                            </span>
                          ) : (
                            <span className="text-xs font-bold bg-black/20 text-white/80 px-2.5 py-1 rounded-full">
                              受付期間外
                            </span>
                          )}
                        </div>
                        <div className="mb-2"><Icon name={school.icon} className="w-8 h-8 text-white" /></div>
                        <p className="text-white/70 text-xs mb-0.5">{school.hojin}</p>
                        {/* 校名は2行分の高さを確保し、色付きヘッダーの高さをカード間で揃える */}
                        <h3 className="text-white font-bold text-lg leading-snug min-h-[3.25rem] flex items-start">
                          <span>
                            {school.name}
                            {"nameShort" in school && <span className="text-white/60 text-sm ml-1">（{(school as typeof school & {nameShort: string}).nameShort}）</span>}
                          </span>
                        </h3>
                      </div>

                      <div className="p-5 flex flex-col flex-1">
                        <p className="text-gray-500 text-sm leading-relaxed mb-4">{school.desc}</p>

                        {/* 受付中の場合：選考情報バナー */}
                        {accepting && cohort && (
                          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-xs text-green-800 space-y-1">
                            <p className="font-bold text-green-700 flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2" /><path strokeLinecap="round" d="M8 3v4M16 3v4M4 10h16" /></svg>
                              第{cohort.round}期選考 受付中
                            </p>
                            {cohort.acceptEnd && (
                              <p>出願締切：<span className="font-semibold">{new Date(cohort.acceptEnd).toLocaleDateString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}まで</span></p>
                            )}
                            {cohort.examDate && (
                              <p>選考日：<span className="font-semibold">{cohort.examDate}</span></p>
                            )}
                          </div>
                        )}

                        {/* 受付期間外でも、次回（受付開始が未来）の回次が設定されていれば開始予定を表示 */}
                        {!accepting && upcoming && upcoming.acceptStart && (
                          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800 space-y-1">
                            <p className="font-bold text-amber-700 flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v5l3 2" /></svg>
                              第{upcoming.round}期 受付開始予定
                            </p>
                            <p>受付開始：<span className="font-semibold">{new Date(upcoming.acceptStart).toLocaleString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></p>
                            {upcoming.acceptEnd && (
                              <p>出願締切：<span className="font-semibold">{new Date(upcoming.acceptEnd).toLocaleDateString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}まで</span></p>
                            )}
                            {upcoming.examDate && (
                              <p>選考日：<span className="font-semibold">{upcoming.examDate}</span></p>
                            )}
                          </div>
                        )}

                        {/* 受付期間外（次回情報なし） */}
                        {!accepting && !upcoming && (
                          <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-500">
                            <p className="font-semibold flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M10 9v6M14 9v6" /></svg>
                              現在、出願受付期間外です
                            </p>
                            <p className="mt-0.5">次回の選考情報は各校にお問い合わせください</p>
                          </div>
                        )}

                        {/* 学科リスト */}
                        <div className="mb-5 flex-1">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">学科</p>
                          <div className="flex flex-col gap-2">
                            {school.departments.map(d => (
                              <div key={d.name} className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs px-2.5 py-1 rounded-full border ${school.color.tag}`}>{d.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${durationColor[d.duration] ?? "bg-gray-100 text-gray-600"}`}>{d.duration}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {accepting ? (
                          <Link href={`/apply?school=${school.id}`}
                            className={`block w-full ${school.color.btn} text-white text-center text-sm font-semibold py-3 rounded-xl transition-all duration-150 active:scale-[0.98] shadow-sm hover:shadow`}>
                            出願する →
                          </Link>
                        ) : (
                          <div className="block w-full bg-gray-100 text-gray-400 text-center text-sm font-semibold py-3 rounded-xl cursor-not-allowed">
                            受付期間外
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 出願の流れ */}
          <section>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mb-5">出願の流れ</h2>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">

              {/* ステップフロー */}
              <div className="relative">
                {/* 背景の接続グラデーション線（中央配置、アイコン裏） */}
                <div
                  aria-hidden
                  className="hidden sm:block absolute top-7 left-[10%] right-[10%] h-[3px] rounded-full
                             bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 opacity-30"
                />

                <ol className="relative grid grid-cols-5 gap-1 sm:gap-2">
                  {STEPS.map((step) => (
                    <li key={step.n} className="flex flex-col items-center text-center group">
                      {/* アイコン円 */}
                      <div
                        className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl
                                    bg-gradient-to-br ${step.grad} text-white
                                    flex items-center justify-center shadow-md shadow-gray-900/5
                                    ring-4 ring-white
                                    transition-transform duration-200 group-hover:-translate-y-0.5`}
                      >
                        <StepIcon n={step.n} className="w-6 h-6 sm:w-7 sm:h-7" />
                        {/* ステップ番号バッジ */}
                        <span
                          className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[10px] font-extrabold
                                      bg-white text-gray-700 ring-1 ring-gray-200 flex items-center justify-center`}
                        >
                          {step.n}
                        </span>
                      </div>

                      {/* STEP X ラベル */}
                      <span
                        className={`mt-3 mb-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider
                                    ring-1 ${step.chipBg} ${step.chipText}`}
                      >
                        STEP {step.n}
                      </span>

                      {/* 見出し・補足 */}
                      <span className="text-[13px] font-bold text-gray-800 leading-tight">
                        {step.label}
                      </span>
                      <span className="hidden sm:block mt-0.5 text-[11px] text-gray-400 leading-tight px-1">
                        {step.sub}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* 補足カード */}
              <div className="mt-7 pt-6 border-t border-gray-100 grid sm:grid-cols-3 gap-3">
                {[
                  { kind: "tag" as const, label: "選考区分", val: "一般 / 指定推薦 / 特待生",                color: "text-indigo-600", bg: "bg-indigo-50/60" },
                  { kind: "doc" as const, label: "必要書類", val: "証明写真・成績・出席・語学証明 等",        color: "text-violet-600", bg: "bg-violet-50/60" },
                  { kind: "yen" as const, label: "選考費",   val: "振込 or オンライン決済で完了",            color: "text-rose-600",   bg: "bg-rose-50/60" },
                ].map((item) => (
                  <div key={item.label} className={`${item.bg} rounded-xl px-4 py-3 flex items-center gap-3 ring-1 ring-inset ring-gray-100`}>
                    <span className={`flex-shrink-0 w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center ${item.color}`}>
                      <InfoIcon kind={item.kind} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-gray-500 tracking-wide">{item.label}</p>
                      <p className="text-xs text-gray-700 leading-snug">{item.val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* サブリンク */}
          <section className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0"><Icon name="clipboard" className="w-5 h-5" /></div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-800 mb-1">出願の続き・状況確認</h3>
                <p className="text-gray-500 text-sm mb-3">
                  既に出願番号をお持ちの方はこちらから続き（書類アップロード・選考料お支払い）や審査状況の確認ができます。
                </p>
                <Link
                  href="/apply/status"
                  className="inline-flex items-center gap-1.5 text-sm bg-white hover:bg-blue-50 text-blue-700 font-bold px-4 py-2 rounded-lg border border-blue-200 transition active:scale-[0.98]"
                >
                  出願番号でログイン →
                </Link>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex items-start gap-4">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0"><Icon name="phone" className="w-5 h-5" /></div>
              <div>
                <h3 className="font-bold text-gray-800 mb-1">お問い合わせ</h3>
                <p className="text-gray-500 text-sm">出願に関するご不明点は各校の入学相談室（平日 9:00〜17:00）までお問い合わせください。</p>
              </div>
            </div>
          </section>

        </div>
      </main>

      <footer className="bg-white border-t border-gray-100 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-gray-400 text-xs">
© 2026 学校法人羽場学園 中央ゼミナール / 学校法人平井学園 神奈川柔整鍼灸専門学校
          </p>
        </div>
      </footer>
    </div>
  );
}
