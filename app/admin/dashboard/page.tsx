"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStatusStyle, getJapaneseLevelStyle, formatDateTimeJP } from "@/lib/utils";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/Icon";
import { HelpTip } from "@/components/admin/HelpTip";
import { APPLICANT_TYPE_LABEL } from "@/lib/applicantType";
import { IN_PROGRESS_STATUSES, IN_PROGRESS_FILTER } from "@/lib/schemas";

const STATUSES = ["all", "受付中", "書類確認中", "面接待ち", "結果待ち", "合格", "補欠合格", "不合格", "保留"];
const JAPANESE_LEVELS = ["all", "N1", "N2", "N3", "N4", "N5", "なし"];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface Agent { id: string; name: string; country: string; isActive: boolean; }
interface Cohort { id: string; name: string; status: string; }

interface Document {
  id: string;
  docType: string;
  fileName: string;
}

interface EnrollmentSummary {
  status: string;
  schoolConfirmed: boolean;
  admitLetterIssued: boolean;
}

interface Application {
  id: string;
  applicationNo: string;
  status: string;
  createdAt: string;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  nationality: string;
  japaneseLevel: string;
  email: string;
  phone: string;
  schoolName: string;
  department: string;
  applicationSchools?: { priority: number; schoolName: string; department: string; result: string | null }[];
  examMode?: string;
  referrerName?: string | null;
  examFeeStatus?: string;
  examFeeAmount?: number | null;
  enrollmentYear: string;
  enrollmentMonth: string;
  lastSchoolName: string;
  lastSchoolCountry: string;
  priorAttendanceRate: string | null;
  documents: Document[];
  agent?: { id: string; name: string; country: string } | null;
  cohort?: { id: string; name: string } | null;
  enrollmentProcedure?: EnrollmentSummary | null;
}

interface PaginatedResponse {
  applications: Application[];
  total: number;
  page: number;
  totalPages: number;
}

interface GlobalStats {
  total: number;
  statusCounts: Record<string, number>;
  todayCount: number;
  enrollmentStats: {
    announced: number;
    step1Waiting: number;
    step2Waiting: number;
    schoolConfirmWaiting: number;
    admitLetterIssued: number;
  };
}

// 手続き進捗ステップを計算する
function getEnrollmentStep(ep: EnrollmentSummary): { label: string; style: string } {
  if (ep.admitLetterIssued) return { label: "許可書発行済", style: "bg-purple-100 text-purple-800" };
  if (ep.schoolConfirmed)   return { label: "学校承認待ち", style: "bg-indigo-100 text-indigo-800" };
  const s = ep.status;
  if (s === "STEP3完了" || s === "完了") return { label: "署名完了", style: "bg-teal-100 text-teal-800" };
  if (s === "STEP2完了") return { label: "書類提出済", style: "bg-cyan-100 text-cyan-800" };
  if (s === "STEP1完了") return { label: "振込確認済", style: "bg-sky-100 text-sky-800" };
  if (s === "案内済み")   return { label: "手続き案内済", style: "bg-sky-50 text-sky-700" };
  return { label: "手続き中", style: "bg-gray-100 text-gray-600" };
}

// 旧ヘッダー用の useAdminRole / AccountManagementLink / UserBadge は
// サイドバー(AdminShell)へ統合されたため削除済み（役割表示はサイドバー下部）。

// 列の表示/非表示定義
const COLUMN_DEFS = [
  { key: "applicationNo", label: "申請番号", default: true, required: true },
  { key: "name",          label: "氏名",     default: true, required: true },
  { key: "nationality",   label: "国籍",     default: true },
  { key: "japaneseLevel", label: "日本語",   default: true },
  { key: "lastSchool",    label: "出身校",   default: false },
  { key: "schools",       label: "志望校",   default: true },
  { key: "enrollment",    label: "入学希望", default: true },
  { key: "documents",     label: "書類",     default: true },
  { key: "cohort",        label: "選考",     default: true },
  { key: "agent",         label: "エージェント", default: false },
  { key: "examFee",       label: "選考費",   default: false },
  { key: "status",        label: "状態",     default: true, required: true },
  { key: "createdAt",     label: "申請日",   default: true },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [applicantTypeFilter, setApplicantTypeFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [todayOnly, setTodayOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 定員サマリー
  const [quotaSummary, setQuotaSummary] = useState<{ totalQuota: number; totalAccepted: number; totalRemaining: number; year: string } | null>(null);

  // Cohortサマリー
  interface CohortSummary {
    total: number;
    passedCount: number;
    reviewedCount: number;
    passRate: number | null;
    withDocs: number;
    docRate: number | null;
    statusCounts: Record<string, number>;
  }
  const [cohortSummary, setCohortSummary] = useState<CohortSummary | null>(null);
  const [cohortSummaryLoading, setCohortSummaryLoading] = useState(false);

  // 列表示設定
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c.default]))
  );
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // 列メニューの外クリックで閉じる
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 初期データ取得
  useEffect(() => {
    fetch("/api/agents").then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : (d.agents || [])));
    fetch("/api/cohorts").then(r => r.json()).then(d => Array.isArray(d) && setCohorts(d));
    // 定員サマリー: 定員レコードに出現する enrollmentYear のうち
    // 「現在年度以降の最も若い年度」を選択。なければ最新年度。
    fetch("/api/admin/quota").then(r => r.json()).then(rows => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const currentYear = new Date().getFullYear();
      const years = Array.from(
        new Set((rows as { enrollmentYear: string }[]).map(r => r.enrollmentYear)),
      ).sort();
      const target = years.find(y => Number(y) >= currentYear) ?? years[years.length - 1];
      const filtered = rows.filter((r: { enrollmentYear: string }) => r.enrollmentYear === target);
      const totalQuota = filtered.reduce((s: number, r: { quota: number }) => s + (r.quota || 0), 0);
      const totalAccepted = filtered.reduce((s: number, r: { accepted: number }) => s + r.accepted, 0);
      const totalRemaining = filtered.reduce((s: number, r: { remaining: number }) => s + Math.max(r.remaining, 0), 0);
      setQuotaSummary({ totalQuota, totalAccepted, totalRemaining, year: target });
    });
    // グローバル統計（全量）
    fetch("/api/applications/stats").then(r => r.json()).then(d => setGlobalStats(d));
  }, []);

  // Cohortフィルター選択時にサマリーを取得
  useEffect(() => {
    if (cohortFilter === "all") {
      setCohortSummary(null);
      return;
    }
    setCohortSummaryLoading(true);
    fetch(`/api/applications/stats?cohortId=${encodeURIComponent(cohortFilter)}`)
      .then(r => r.json())
      .then(d => { if (d.cohortSummary) setCohortSummary(d.cohortSummary); })
      .catch(() => {})
      .finally(() => setCohortSummaryLoading(false));
  }, [cohortFilter]);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (applicantTypeFilter !== "all") params.set("applicantType", applicantTypeFilter);
      if (levelFilter !== "all") params.set("japaneseLevel", levelFilter);
      if (agentFilter !== "all") params.set("agentId", agentFilter);
      if (cohortFilter !== "all") params.set("cohortId", cohortFilter);
      if (search) params.set("search", search);
      if (todayOnly) params.set("todayOnly", "1");

      const res = await fetch(`/api/applications?${params}`);
      if (res.status === 401) { router.push("/admin"); return; }
      if (!res.ok) throw new Error("取得に失敗しました");
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, applicantTypeFilter, levelFilter, agentFilter, cohortFilter, search, todayOnly, router]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // 検索デバウンス
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 400);
  };

  const handleLogout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin");
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    window.open(`/api/applications/export?${params}`, "_blank");
  };

  /** 試験日程表（筆記＋面接 全志望校）を CSV ダウンロード */
  const handleScheduleExport = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    window.open(`/api/admin/schedule/export?${params}`, "_blank");
  };

  const col = (key: string) => visibleCols[key] !== false;

  return (
    <>
      {/* wsdb 風タイトル＋メタ */}
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title inline-flex items-center gap-2">ダッシュボード<HelpTip text={"出願者の一覧です。上部のカードや検索・状態で絞り込めます。行をクリックすると申請詳細（基本情報・選考・書類・入学手続き）が開きます。"} /></h1>
          <p className="wsdb-topbar-meta">出願・選考・入学手続き 一覧</p>
        </div>
      </div>

      <div className="max-w-screen-2xl">

        {/* ===== Hero スタッツ（4枚、wsdb 風） ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div
            style={{ "--reveal-delay": "0ms", "--wsdb-accent": "#2563eb" } as CSSProperties}
            className={`reveal-up wsdb-stat ${statusFilter === "all" && !todayOnly ? "active" : ""}`}
            onClick={() => { setStatusFilter("all"); setTodayOnly(false); setPage(1); }}
          >
            <div className="wsdb-stat-body">
              <div className="wsdb-stat-label">全申請</div>
              <div className="wsdb-stat-value">{globalStats?.total ?? "—"}</div>
              <div className="wsdb-stat-sub">累計</div>
            </div>
            <div className="wsdb-stat-icon wsdb-stat-icon-blue"><Icon name="clipboard" className="w-6 h-6" /></div>
          </div>
          <div
            style={{ "--reveal-delay": "70ms", "--wsdb-accent": "#d97706" } as CSSProperties}
            className={`reveal-up wsdb-stat ${todayOnly ? "active" : ""}`}
            onClick={() => { setTodayOnly(v => !v); setPage(1); }}
          >
            <div className="wsdb-stat-body">
              <div className="wsdb-stat-label">今日の申請</div>
              <div className="wsdb-stat-value">{globalStats?.todayCount ?? "—"}</div>
              <div className="wsdb-stat-sub">直近24時間</div>
            </div>
            <div className="wsdb-stat-icon wsdb-stat-icon-amber"><Icon name="calendar" className="w-6 h-6" /></div>
          </div>
          <div
            style={{ "--reveal-delay": "140ms", "--wsdb-accent": "#7c3aed" } as CSSProperties}
            className={`reveal-up wsdb-stat ${statusFilter === IN_PROGRESS_FILTER ? "active" : ""}`}
            onClick={() => { setStatusFilter(IN_PROGRESS_FILTER); setTodayOnly(false); setPage(1); }}
          >
            <div className="wsdb-stat-body">
              <div className="wsdb-stat-label">進行中</div>
              <div className="wsdb-stat-value">
                {IN_PROGRESS_STATUSES.reduce((sum, s) => sum + (globalStats?.statusCounts[s] ?? 0), 0)}
              </div>
              <div className="wsdb-stat-sub">受付 + 書類 + 面接</div>
            </div>
            <div className="wsdb-stat-icon wsdb-stat-icon-purple"><Icon name="users" className="w-6 h-6" /></div>
          </div>
          <div
            style={{ "--reveal-delay": "210ms", "--wsdb-accent": "#059669" } as CSSProperties}
            className={`reveal-up wsdb-stat ${statusFilter === "合格" ? "active" : ""}`}
            onClick={() => { setStatusFilter("合格"); setTodayOnly(false); setPage(1); }}
          >
            <div className="wsdb-stat-body">
              <div className="wsdb-stat-label">合格</div>
              <div className="wsdb-stat-value">{globalStats?.statusCounts["合格"] ?? 0}</div>
              <div className="wsdb-stat-sub">合格確定</div>
            </div>
            <div className="wsdb-stat-icon wsdb-stat-icon-green"><Icon name="check" className="w-6 h-6" /></div>
          </div>
        </div>

        {/* ===== ステータス別フィルター（ピル） ===== */}
        <div className="flex flex-wrap gap-2 mb-5">
          {STATUSES.slice(1).map((s) => {
            const count = globalStats?.statusCounts[s] ?? 0;
            const isActive = statusFilter === s && !todayOnly;
            return (
              <button
                key={s}
                onClick={() => { setStatusFilter(isActive ? "all" : s); setTodayOnly(false); setPage(1); }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  isActive
                    ? "bg-accent text-white border-accent"
                    : "bg-white text-ink border-line hover:bg-soft"
                }`}
              >
                {s}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? "bg-white/20" : "bg-soft"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ===== 定員サマリー ===== */}
        {quotaSummary && quotaSummary.totalQuota > 0 && (
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-navy-700">{quotaSummary.year}年度 留学生定員状況</h3>
              <Link href="/admin/quota" className="text-xs text-navy-600 hover:underline font-medium">詳細 →</Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-navy-50 border border-navy-200 rounded-lg p-3 text-center">
                <p className="text-xs text-navy-500 mb-1">総定員</p>
                <p className="text-2xl font-bold text-navy-800">{quotaSummary.totalQuota}<span className="text-sm font-normal ml-0.5">名</span></p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600 mb-1">合格確定</p>
                <p className="text-2xl font-bold text-green-700">{quotaSummary.totalAccepted}<span className="text-sm font-normal ml-0.5">名</span></p>
                <p className="text-xs text-green-500">{quotaSummary.totalQuota > 0 ? Math.round(quotaSummary.totalAccepted/quotaSummary.totalQuota*100) : 0}%</p>
              </div>
              <div className={`border rounded-lg p-3 text-center ${quotaSummary.totalRemaining <= 5 ? "bg-red-50 border-red-200" : quotaSummary.totalRemaining <= 15 ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-200"}`}>
                <p className={`text-xs mb-1 ${quotaSummary.totalRemaining <= 5 ? "text-red-500" : quotaSummary.totalRemaining <= 15 ? "text-yellow-600" : "text-gray-500"}`}>残定員</p>
                <p className={`text-2xl font-bold ${quotaSummary.totalRemaining <= 5 ? "text-red-600" : quotaSummary.totalRemaining <= 15 ? "text-yellow-700" : "text-gray-700"}`}>
                  {quotaSummary.totalRemaining}<span className="text-sm font-normal ml-0.5">名</span>
                </p>
                {quotaSummary.totalRemaining <= 5 && <p className="text-xs text-red-500 font-semibold">残り僅か！</p>}
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>充足率</span>
                <span>{quotaSummary.totalQuota > 0 ? Math.round(quotaSummary.totalAccepted/quotaSummary.totalQuota*100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${quotaSummary.totalAccepted/quotaSummary.totalQuota >= 0.9 ? "bg-red-500" : quotaSummary.totalAccepted/quotaSummary.totalQuota >= 0.7 ? "bg-yellow-400" : "bg-green-500"}`}
                  style={{ width: `${Math.min(Math.round(quotaSummary.totalAccepted/quotaSummary.totalQuota*100), 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ===== Cohortサマリーカード ===== */}
        {cohortFilter !== "all" && (
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-navy-700">
                {cohorts.find(c => c.id === cohortFilter)?.name ?? "選考"} サマリー
              </h3>
              {cohortSummaryLoading && (
                <svg className="animate-spin w-4 h-4 text-navy-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
            {cohortSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-navy-50 border border-navy-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-navy-500 mb-1">出願数</p>
                  <p className="text-2xl font-bold text-navy-800">{cohortSummary.total}<span className="text-sm font-normal ml-0.5">件</span></p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-600 mb-1">合格率</p>
                  <p className="text-2xl font-bold text-green-700">
                    {cohortSummary.passRate !== null
                      ? `${Math.round(cohortSummary.passRate * 100)}%`
                      : "—"}
                  </p>
                  <p className="text-xs text-green-500">{cohortSummary.passedCount}名 / 審査済{cohortSummary.reviewedCount}名</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-600 mb-1">書類提出率</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {cohortSummary.docRate !== null
                      ? `${Math.round(cohortSummary.docRate * 100)}%`
                      : "—"}
                  </p>
                  <p className="text-xs text-blue-500">{cohortSummary.withDocs}名 / 全{cohortSummary.total}名</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">審査済み</p>
                  <p className="text-2xl font-bold text-gray-700">{cohortSummary.reviewedCount}<span className="text-sm font-normal ml-0.5">件</span></p>
                  <p className="text-xs text-gray-400">
                    {cohortSummary.total > 0 ? `${Math.round(cohortSummary.reviewedCount / cohortSummary.total * 100)}%` : "0%"}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== 入学手続き進捗（全量） ===== */}
        {globalStats?.enrollmentStats && (() => {
          const es = globalStats.enrollmentStats;
          const total = es.announced + es.step1Waiting + es.step2Waiting + es.schoolConfirmWaiting + es.admitLetterIssued;
          if (total === 0) return null;
          return (
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-navy-700">入学手続き進捗（全合格者）</h3>
                <Link href="/admin/enrollment" className="text-xs text-navy-600 hover:underline font-medium">管理画面 →</Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Link href="/admin/enrollment" className="block bg-sky-50 border border-sky-200 rounded-lg p-3 text-center transition hover:border-sky-400 hover:shadow-sm">
                  <p className="text-xs text-sky-600 mb-1">手続き案内済み</p>
                  <p className="text-xl font-bold text-sky-800">{es.announced}件</p>
                </Link>
                <Link href="/admin/enrollment?step=step1" className="block bg-blue-50 border border-blue-200 rounded-lg p-3 text-center transition hover:border-blue-400 hover:shadow-sm">
                  <p className="text-xs text-blue-600 mb-1">学費振込待ち</p>
                  <p className="text-xl font-bold text-blue-800">{es.step1Waiting}件</p>
                </Link>
                <Link href="/admin/enrollment?step=step2" className="block bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-center transition hover:border-cyan-400 hover:shadow-sm">
                  <p className="text-xs text-cyan-600 mb-1">書類提出待ち</p>
                  <p className="text-xl font-bold text-cyan-800">{es.step2Waiting}件</p>
                </Link>
                <Link href="/admin/enrollment?step=schoolConfirm" className="block bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center transition hover:border-indigo-400 hover:shadow-sm">
                  <p className="text-xs text-indigo-600 mb-1">学校承認待ち</p>
                  <p className="text-xl font-bold text-indigo-800">{es.schoolConfirmWaiting}件</p>
                </Link>
                <Link href="/admin/enrollment?step=admitLetter" className="block bg-purple-50 border border-purple-200 rounded-lg p-3 text-center transition hover:border-purple-400 hover:shadow-sm">
                  <p className="text-xs text-purple-600 mb-1">許可書発行済み</p>
                  <p className="text-xl font-bold text-purple-800">{es.admitLetterIssued}件</p>
                </Link>
              </div>
            </div>
          );
        })()}

        {/* ===== フィルター & 検索 ===== */}
        <div className="card mb-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-center">
            {/* 検索（デバウンス） */}
            <div className="flex-1 min-w-48 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="form-input pl-9 w-full"
                placeholder="氏名・申請番号・メールで検索..."
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>

            {/* 今日のみ */}
            <button
              onClick={() => { setTodayOnly(v => !v); setPage(1); }}
              className={`px-3 py-2 text-sm font-semibold rounded-lg border transition whitespace-nowrap inline-flex items-center gap-1.5 ${todayOnly ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-600 border-gray-300 hover:bg-orange-50"}`}
            >
              <Icon name="calendar" className="w-4 h-4" /> 今日のみ
            </button>

            {/* ステータス */}
            <select className="form-input w-full sm:w-40" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="all">全ての状態</option>
              <option value={IN_PROGRESS_FILTER}>進行中（受付+書類+面接）</option>
              {STATUSES.slice(1).map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* 出願者タイプ */}
            <select className="form-input w-full sm:w-32" value={applicantTypeFilter} onChange={e => { setApplicantTypeFilter(e.target.value); setPage(1); }}>
              <option value="all">全ての区分</option>
              <option value="japanese">{APPLICANT_TYPE_LABEL.japanese}</option>
              <option value="foreign">{APPLICANT_TYPE_LABEL.foreign}</option>
            </select>

            {/* 日本語レベル */}
            <select className="form-input w-full sm:w-36" value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setPage(1); }}>
              <option value="all">全日本語レベル</option>
              {JAPANESE_LEVELS.slice(1).map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            {/* 選考 */}
            <select className="form-input w-full sm:w-44" value={cohortFilter} onChange={e => { setCohortFilter(e.target.value); setPage(1); }}>
              <option value="all">全選考</option>
              <option value="none">バッチ未設定</option>
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* エージェント */}
            <select className="form-input w-full sm:w-44" value={agentFilter} onChange={e => { setAgentFilter(e.target.value); setPage(1); }}>
              <option value="all">全エージェント</option>
              <option value="none">エージェントなし</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            {/* 列表示設定 */}
            <div className="relative" ref={colMenuRef}>
              <button
                onClick={() => setShowColMenu(v => !v)}
                className="px-3 py-2 text-sm font-semibold rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition whitespace-nowrap flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                列
              </button>
              {showColMenu && (
                <div className="absolute right-0 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-48">
                  <p className="text-xs font-semibold text-gray-500 mb-2">表示する列</p>
                  {COLUMN_DEFS.filter(c => !c.required).map(c => (
                    <label key={c.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1">
                      <input
                        type="checkbox"
                        checked={!!visibleCols[c.key]}
                        onChange={e => setVisibleCols(prev => ({ ...prev, [c.key]: e.target.checked }))}
                        className="accent-navy-700"
                      />
                      <span className="text-sm text-gray-700">{c.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* CSV: 申請一覧 */}
            <button
              onClick={handleExport}
              title="表示中の申請一覧を CSV ダウンロード"
              className="btn-secondary flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              申請一覧
            </button>

            {/* CSV: 試験日程表 */}
            <button
              onClick={handleScheduleExport}
              title="筆記＋面接の試験日程を全志望校分まとめて CSV ダウンロード"
              className="btn-secondary flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              日程表
            </button>
          </div>

          {/* アクティブフィルター表示 */}
          {(statusFilter !== "all" || applicantTypeFilter !== "all" || levelFilter !== "all" || agentFilter !== "all" || cohortFilter !== "all" || todayOnly || search) && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400 self-center">フィルター:</span>
              {todayOnly && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">今日のみ <button onClick={() => { setTodayOnly(false); setPage(1); }} className="ml-1 hover:text-orange-900">×</button></span>}
              {statusFilter !== "all" && <span className="text-xs bg-navy-100 text-navy-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">{statusFilter} <button onClick={() => { setStatusFilter("all"); setPage(1); }} className="ml-1 hover:text-navy-900">×</button></span>}
              {applicantTypeFilter !== "all" && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${applicantTypeFilter === "japanese" ? "bg-teal-100 text-teal-700" : "bg-blue-100 text-blue-700"}`}>{APPLICANT_TYPE_LABEL[applicantTypeFilter as "japanese" | "foreign"] ?? applicantTypeFilter} <button onClick={() => { setApplicantTypeFilter("all"); setPage(1); }} className="ml-1 hover:opacity-70">×</button></span>}
              {levelFilter !== "all" && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">{levelFilter} <button onClick={() => { setLevelFilter("all"); setPage(1); }} className="ml-1 hover:text-purple-900">×</button></span>}
              {cohortFilter !== "all" && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">{cohorts.find(c => c.id === cohortFilter)?.name ?? cohortFilter} <button onClick={() => { setCohortFilter("all"); setPage(1); }} className="ml-1 hover:text-indigo-900">×</button></span>}
              {agentFilter !== "all" && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">{agents.find(a => a.id === agentFilter)?.name ?? agentFilter} <button onClick={() => { setAgentFilter("all"); setPage(1); }} className="ml-1 hover:text-blue-900">×</button></span>}
              {search && <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">"{search}" <button onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }} className="ml-1 hover:text-gray-900">×</button></span>}
              <button
                onClick={() => { setStatusFilter("all"); setApplicantTypeFilter("all"); setLevelFilter("all"); setAgentFilter("all"); setCohortFilter("all"); setTodayOnly(false); setSearch(""); setSearchInput(""); setPage(1); }}
                className="text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-0.5 rounded-full hover:bg-red-50 transition"
              >
                すべてクリア
              </button>
            </div>
          )}
        </div>

        {/* ===== テーブル ===== */}
        {error ? (
          <div className="card text-center py-8 text-red-600">
            <p>{error}</p>
            <button onClick={fetchApplications} className="btn-primary mt-4">再読み込み</button>
          </div>
        ) : loading ? (
          <SkeletonList rows={Math.min(data?.applications.length || 6, pageSize)} cols={7} />
        ) : (
          <>
            {/* ===== モバイルカードビュー (md未満) ===== */}
            <div className="block md:hidden space-y-3 mb-4">
              {data?.applications.length === 0 ? (
                <EmptyState
                  icon="📭"
                  title="申請がありません"
                  description="該当する申請が見つかりません。フィルター条件を変更してみてください。"
                />
              ) : (
                data?.applications.map((app) => (
                  <div
                    key={app.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => router.push(`/admin/applications/${app.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{app.lastName} {app.firstName}</p>
                          {app.examMode === "一般" ? (<span className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0 bg-orange-100 text-orange-700">筆記</span>) : app.examMode && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-bold shrink-0 ${app.examMode === "特待生" ? "bg-yellow-100 text-yellow-700" : "bg-purple-100 text-purple-700"}`}>
                              {app.examMode === "特待生" ? "★特待" : "◆推薦"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{app.lastNameKana} {app.firstNameKana}</p>
                      </div>
                      <span className={`status-badge shrink-0 ${getStatusStyle(app.status)}`}>{app.status}</span>
                    </div>
                    <p className="text-xs font-mono text-gray-500 mb-2">{app.applicationNo}</p>
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <p className="truncate">{app.schoolName}{app.department ? ` / ${app.department}` : ""}</p>
                      <p className="text-gray-400">{formatDateTimeJP(app.createdAt)}</p>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Link
                        href={`/admin/applications/${app.id}`}
                        className="text-navy-700 hover:text-navy-900 font-medium text-xs"
                        onClick={e => e.stopPropagation()}
                      >
                        詳細                       </Link>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ===== デスクトップテーブルビュー (md以上) ===== */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-navy-800 text-white">
                    <tr>
                      {col("applicationNo") && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">申請番号</th>}
                      {col("name")          && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">氏名</th>}
                      {col("nationality")   && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">国籍</th>}
                      {col("japaneseLevel") && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">日本語</th>}
                      {col("lastSchool")    && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">出身校・出席率</th>}
                      {col("schools")       && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">志望校</th>}
                      {col("enrollment")    && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">入学希望</th>}
                      {col("documents")     && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">書類</th>}
                      {col("cohort")        && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">選考</th>}
                      {col("agent")         && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">エージェント</th>}
                      {col("examFee")       && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">選考費</th>}
                      {col("status")        && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">状態</th>}
                      {col("createdAt")     && <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">申請日</th>}
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data?.applications.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="p-0">
                          <EmptyState
                            className="border-0 rounded-none"
                            icon="📭"
                            title="申請がありません"
                            description="該当する申請が見つかりません。フィルター条件を変更してみてください。"
                          />
                        </td>
                      </tr>
                    ) : (
                      data?.applications.map((app) => (
                        <tr
                          key={app.id}
                          data-testid={`app-row-${app.applicationNo}`}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/admin/applications/${app.id}`)}
                        >
                          {col("applicationNo") && (
                            <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{app.applicationNo}</td>
                          )}
                          {col("name") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <p className="font-semibold text-gray-900">{app.lastName} {app.firstName}</p>
                                {app.examMode === "一般" ? (<span className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0 bg-orange-100 text-orange-700">筆記</span>) : app.examMode && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold shrink-0 ${app.examMode === "特待生" ? "bg-yellow-100 text-yellow-700" : "bg-purple-100 text-purple-700"}`}>
                                    {app.examMode === "特待生" ? "★特待" : "◆推薦"}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">{app.lastNameKana} {app.firstNameKana}</p>
                              {app.referrerName && <p className="text-xs text-gray-400 truncate max-w-[120px]">{app.referrerName}</p>}
                            </td>
                          )}
                          {col("nationality") && (
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{app.nationality}</td>
                          )}
                          {col("japaneseLevel") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`status-badge ${getJapaneseLevelStyle(app.japaneseLevel)}`}>{app.japaneseLevel}</span>
                            </td>
                          )}
                          {col("lastSchool") && (
                            <td className="px-4 py-3">
                              <p className="text-gray-800 text-xs whitespace-nowrap">{app.lastSchoolName}</p>
                              <p className="text-xs text-gray-400">{app.lastSchoolCountry}</p>
                              {app.priorAttendanceRate && (() => {
                                const rate = parseInt(app.priorAttendanceRate);
                                const color = rate >= 90 ? "text-green-600" : rate >= 80 ? "text-yellow-600" : "text-red-600";
                                return <p className={`text-xs font-bold mt-0.5 ${color}`}>出席率 {app.priorAttendanceRate}</p>;
                              })()}
                            </td>
                          )}
                          {col("schools") && (
                            <td className="px-4 py-3 min-w-[160px]">
                              {(app.applicationSchools && app.applicationSchools.length > 0
                                ? app.applicationSchools
                                : [{ priority: 1, schoolName: app.schoolName, department: app.department, result: null }]
                              ).map(s => (
                                <div key={s.priority} className="flex items-center gap-1 mb-0.5">
                                  <span className={`text-xs shrink-0 ${s.priority === 1 ? "text-navy-600 font-bold" : "text-gray-400"}`}>
                                    {["①","②","③"][s.priority - 1] || `${s.priority}.`}
                                  </span>
                                  <span className="text-xs text-gray-700 whitespace-nowrap">{s.schoolName}</span>
                                  {s.result && (
                                    <span className={`text-xs px-1 rounded shrink-0 ${s.result === "合格" ? "text-green-600" : s.result === "不合格" ? "text-red-500" : "text-yellow-600"}`}>
                                      {s.result === "合格" ? "✓" : s.result === "不合格" ? "✗" : "△"}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </td>
                          )}
                          {col("enrollment") && (
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{app.enrollmentYear}年{app.enrollmentMonth}月</td>
                          )}
                          {col("documents") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${app.documents.length > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                {app.documents.length}件
                              </span>
                            </td>
                          )}
                          {col("cohort") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {app.cohort
                                ? <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{app.cohort.name}</span>
                                : <span className="text-xs text-gray-300">—</span>}
                            </td>
                          )}
                          {col("agent") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {app.agent
                                ? <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{app.agent.name}</span>
                                : <span className="text-xs text-gray-300">—</span>}
                            </td>
                          )}
                          {col("examFee") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {app.examFeeStatus && (
                                <div className="flex flex-col gap-0.5">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    app.examFeeStatus === "確認済み" ? "bg-green-100 text-green-700" :
                                    app.examFeeStatus === "確認中"  ? "bg-yellow-100 text-yellow-700" :
                                    app.examFeeStatus === "免除"    ? "bg-gray-100 text-gray-600" :
                                    "bg-red-100 text-red-600"
                                  }`}>{app.examFeeStatus}</span>
                                  {app.examFeeAmount && <span className="text-xs text-gray-400">¥{app.examFeeAmount.toLocaleString()}</span>}
                                </div>
                              )}
                            </td>
                          )}
                          {col("status") && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <span className={`status-badge ${getStatusStyle(app.status)}`}>{app.status}</span>
                                {(app.status === "合格" || app.status === "補欠合格") && app.enrollmentProcedure && (() => {
                                  const step = getEnrollmentStep(app.enrollmentProcedure!);
                                  return <span className={`status-badge text-xs ${step.style}`}>{step.label}</span>;
                                })()}
                              </div>
                            </td>
                          )}
                          {col("createdAt") && (
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDateTimeJP(app.createdAt)}</td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Link
                              href={`/admin/applications/${app.id}`}
                              className="text-navy-700 hover:text-navy-900 font-medium text-xs"
                              onClick={e => e.stopPropagation()}
                            >
                              詳細                             </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ===== ページネーション ===== */}
            <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-500">
                  全{data?.total ?? 0}件中 {data && data.total > 0 ? (page - 1) * pageSize + 1 : 0}〜{data ? Math.min(page * pageSize, data.total) : 0}件を表示
                </p>
                {/* 1ページ件数 */}
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-600"
                >
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}件/ページ</option>)}
                </select>
              </div>
              {data && data.totalPages > 1 && (
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(1)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">前へ</button>
                  {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                    .filter(p => Math.abs(p - page) <= 2)
                    .map(p => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-1.5 text-sm rounded-lg border ${p === page ? "bg-navy-800 text-white border-navy-800" : "border-gray-300 hover:bg-gray-50"}`}
                      >
                        {p}
                      </button>
                    ))}
                  <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">次へ</button>
                  <button disabled={page >= data.totalPages} onClick={() => setPage(data.totalPages)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
