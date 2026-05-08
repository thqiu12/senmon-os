"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStatusStyle, getJapaneseLevelStyle, formatDateTimeJP } from "@/lib/utils";

const STATUSES = ["all", "受付中", "書類確認中", "面接待ち", "合格", "補欠合格", "不合格", "保留"];
const JAPANESE_LEVELS = ["all", "N1", "N2", "N3", "N4", "N5", "なし"];

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

// 手続き進捗ステップを計算する
function getEnrollmentStep(ep: EnrollmentSummary): { label: string; style: string } {
  if (ep.admitLetterIssued) return { label: "📜 許可書発行済", style: "bg-purple-100 text-purple-800" };
  if (ep.schoolConfirmed)   return { label: "🏫 学校承認待ち", style: "bg-indigo-100 text-indigo-800" };
  const s = ep.status;
  if (s === "STEP3完了" || s === "完了") return { label: "✍️ 署名完了", style: "bg-teal-100 text-teal-800" };
  if (s === "STEP2完了") return { label: "📄 書類提出済", style: "bg-cyan-100 text-cyan-800" };
  if (s === "STEP1完了") return { label: "💴 振込確認済", style: "bg-sky-100 text-sky-800" };
  if (s === "案内済み")   return { label: "📨 手続き案内済", style: "bg-sky-50 text-sky-700" };
  return { label: "⏳ 手続き中", style: "bg-gray-100 text-gray-600" };
}

// ロールCookie読み取りヘルパー
function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? m[2] : "";
}

function AccountManagementLink() {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(getCookie("admin_role") === "super_admin"); }, []);
  if (!show) return null;
  return (
    <Link href="/admin/accounts" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700 whitespace-nowrap">
      アカウント
    </Link>
  );
}

function UserBadge() {
  const [role, setRole] = useState("");
  useEffect(() => { setRole(getCookie("admin_role")); }, []);
  if (!role) return null;
  const ROLE_DISPLAY: Record<string, { label: string; icon: string }> = {
    super_admin: { label: "スーパー管理者", icon: "👑" },
    admin:       { label: "管理者",         icon: "🔑" },
    interviewer: { label: "面接官",         icon: "📋" },
  };
  const r = ROLE_DISPLAY[role] || { label: role, icon: "👤" };
  return (
    <div className="flex items-center gap-1 bg-navy-700 px-2 py-1.5 rounded-lg whitespace-nowrap">
      <span className="text-xs">{r.icon}</span>
      <span className="text-xs text-white font-medium">{r.label}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);

  // 入学手続き進捗サマリー
  const [enrollmentStats, setEnrollmentStats] = useState<{
    announced: number;
    step1Waiting: number;
    step2Waiting: number;
    schoolConfirmWaiting: number;
    admitLetterIssued: number;
  } | null>(null);

  // 定員サマリー
  const [quotaSummary, setQuotaSummary] = useState<{ totalQuota: number; totalAccepted: number; totalRemaining: number; year: string } | null>(null);

  useEffect(() => {
    fetch("/api/agents").then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : (d.agents || [])));
    fetch("/api/cohorts").then(r => r.json()).then(d => Array.isArray(d) && setCohorts(d));
    // 定員サマリー（翌年度）
    const nextYear = String(new Date().getFullYear() + 1);
    fetch("/api/admin/quota").then(r => r.json()).then(rows => {
      if (!Array.isArray(rows)) return;
      const filtered = rows.filter((r: { enrollmentYear: string }) => r.enrollmentYear === nextYear);
      const totalQuota = filtered.reduce((s: number, r: { quota: number }) => s + (r.quota || 0), 0);
      const totalAccepted = filtered.reduce((s: number, r: { accepted: number }) => s + r.accepted, 0);
      const totalRemaining = filtered.reduce((s: number, r: { remaining: number }) => s + Math.max(r.remaining, 0), 0);
      setQuotaSummary({ totalQuota, totalAccepted, totalRemaining, year: nextYear });
    });
  }, []);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (levelFilter !== "all") params.set("japaneseLevel", levelFilter);
      if (agentFilter !== "all") params.set("agentId", agentFilter);
      if (cohortFilter !== "all") params.set("cohortId", cohortFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/applications?${params}`);
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      if (!res.ok) throw new Error("取得に失敗しました");
      const json = await res.json();
      setData(json);

      // 入学手続き進捗を集計（合格/補欠合格のみ）
      const passedApps: Application[] = json.applications.filter(
        (a: Application) => a.status === "合格" || a.status === "補欠合格"
      );
      const stats = {
        announced: passedApps.filter(a => a.enrollmentProcedure && !a.enrollmentProcedure.schoolConfirmed && !a.enrollmentProcedure.admitLetterIssued).length,
        step1Waiting: passedApps.filter(a => a.enrollmentProcedure?.status === "案内済み").length,
        step2Waiting: passedApps.filter(a => a.enrollmentProcedure?.status === "STEP1完了").length,
        schoolConfirmWaiting: passedApps.filter(a => a.enrollmentProcedure?.schoolConfirmed === false && (a.enrollmentProcedure?.status === "STEP2完了" || a.enrollmentProcedure?.status === "STEP3完了" || a.enrollmentProcedure?.status === "完了")).length,
        admitLetterIssued: passedApps.filter(a => a.enrollmentProcedure?.admitLetterIssued).length,
      };
      setEnrollmentStats(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, levelFilter, agentFilter, cohortFilter, search, router]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleLogout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin");
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    window.open(`/api/applications/export?${params}`, "_blank");
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchApplications();
  };

  const statusCounts = data?.applications
    ? STATUSES.slice(1).reduce((acc, s) => {
        acc[s] = data.applications.filter((a) => a.status === s).length;
        return acc;
      }, {} as Record<string, number>)
    : {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy-800 text-white shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-navy-800 font-bold text-sm">専</span>
            </div>
            <div className="hidden lg:block">
              <h1 className="font-bold text-sm leading-tight">管理ダッシュボード</h1>
              <p className="text-navy-400 text-xs">入学出願システム</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            {/* ===== 出願管理セクション ===== */}
            <div className="flex items-center gap-0.5 border-r border-navy-600 pr-3 mr-1">
              <span className="text-navy-500 text-xs font-bold mr-1 whitespace-nowrap">📋 出願</span>
              <Link href="/admin/cohorts" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700 whitespace-nowrap">
                選考管理
              </Link>
              <Link href="/admin/announcements" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700 whitespace-nowrap">
                お知らせ
              </Link>
              <Link href="/admin/agents" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700 whitespace-nowrap">
                エージェント
              </Link>
              <Link href="/" target="_blank" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700 whitespace-nowrap">
                出願フォーム
              </Link>
            </div>
            {/* ===== 在籍管理セクション ===== */}
            <div className="flex items-center gap-0.5 border-r border-navy-600 pr-3 mr-1">
              <span className="text-navy-500 text-xs font-bold mr-1 whitespace-nowrap">🎓 在籍</span>
              <Link href="/admin/students" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700 whitespace-nowrap">
                在籍管理
              </Link>
              <Link href="/admin/attendance" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700 whitespace-nowrap">
                出席入力
              </Link>
            </div>
            {/* ===== システム管理セクション ===== */}
            <div className="flex items-center gap-0.5 border-r border-navy-600 pr-3 mr-1">
              <span className="text-navy-500 text-xs font-bold mr-1 whitespace-nowrap">⚙️ 管理</span>
              <Link href="/admin/quota" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700 whitespace-nowrap">
                定員管理
              </Link>
              <AccountManagementLink />
            </div>
            <UserBadge />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-navy-700 hover:bg-navy-600 px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div
            className={`card cursor-pointer transition-all hover:shadow-md ${statusFilter === "all" ? "ring-2 ring-navy-600" : ""}`}
            onClick={() => { setStatusFilter("all"); setPage(1); }}
          >
            <p className="text-xs text-gray-500 mb-1">全申請</p>
            <p className="text-2xl font-bold text-navy-800">{data?.total ?? "—"}</p>
          </div>
          {STATUSES.slice(1).map((s) => (
            <div
              key={s}
              className={`card cursor-pointer transition-all hover:shadow-md ${statusFilter === s ? "ring-2 ring-navy-600" : ""}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}
            >
              <p className="text-xs text-gray-500 mb-1">{s}</p>
              <p className="text-2xl font-bold text-navy-800">
                {statusCounts[s] ?? 0}
              </p>
              <span className={`status-badge mt-1 ${getStatusStyle(s)}`}>{s}</span>
            </div>
          ))}
        </div>

        {/* 定員サマリー */}
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
            {/* 充足バー */}
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

        {/* 入学手続き進捗サマリー */}
        {enrollmentStats && (enrollmentStats.announced + enrollmentStats.step1Waiting + enrollmentStats.step2Waiting + enrollmentStats.schoolConfirmWaiting + enrollmentStats.admitLetterIssued) > 0 && (
          <div className="card mb-6">
            <h3 className="text-sm font-bold text-navy-700 mb-3">入学手続き進捗</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-center">
                <p className="text-xs text-sky-600 mb-1">手続き案内済み</p>
                <p className="text-xl font-bold text-sky-800">{enrollmentStats.announced}件</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600 mb-1">💴 学費振込待ち</p>
                <p className="text-xl font-bold text-blue-800">{enrollmentStats.step1Waiting}件</p>
              </div>
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-center">
                <p className="text-xs text-cyan-600 mb-1">📄 書類提出待ち</p>
                <p className="text-xl font-bold text-cyan-800">{enrollmentStats.step2Waiting}件</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
                <p className="text-xs text-indigo-600 mb-1">学校承認待ち</p>
                <p className="text-xl font-bold text-indigo-800">{enrollmentStats.schoolConfirmWaiting}件</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                <p className="text-xs text-purple-600 mb-1">許可書発行済み</p>
                <p className="text-xl font-bold text-purple-800">{enrollmentStats.admitLetterIssued}件</p>
              </div>
            </div>
          </div>
        )}

        {/* Filters & Search */}
        <div className="card mb-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            {/* Search */}
            <form onSubmit={handleSearchSubmit} className="flex-1 min-w-48">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  className="form-input pl-9"
                  placeholder="氏名・申請番号・メールで検索..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </form>

            {/* Status Filter */}
            <select
              className="form-input w-full sm:w-40"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="all">全ての状態</option>
              {STATUSES.slice(1).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Level Filter */}
            <select
              className="form-input w-full sm:w-36"
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
            >
              <option value="all">全日本語レベル</option>
              {JAPANESE_LEVELS.slice(1).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            {/* Cohort Filter */}
            <select
              className="form-input w-full sm:w-44"
              value={cohortFilter}
              onChange={(e) => { setCohortFilter(e.target.value); setPage(1); }}
            >
              <option value="all">全選考</option>
              <option value="none">バッチ未設定</option>
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Agent Filter */}
            <select
              className="form-input w-full sm:w-44"
              value={agentFilter}
              onChange={(e) => { setAgentFilter(e.target.value); setPage(1); }}
            >
              <option value="all">全エージェント</option>
              <option value="none">エージェントなし</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            {/* Export */}
            <button
              onClick={handleExport}
              className="btn-secondary flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSVエクスポート
            </button>
          </div>
        </div>

        {/* Table */}
        {error ? (
          <div className="card text-center py-8 text-red-600">
            <p>{error}</p>
            <button onClick={fetchApplications} className="btn-primary mt-4">
              再読み込み
            </button>
          </div>
        ) : loading ? (
          <div className="card text-center py-16">
            <svg className="animate-spin w-8 h-8 text-navy-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-500 mt-3">読み込み中...</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-navy-800 text-white">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">申請番号</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">氏名</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">国籍</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">日本語</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">出身学校・出席率</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">志望校</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">入学希望</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">書類</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">選考</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">エージェント</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">選考費</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">状態</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">申請日</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data?.applications.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="text-center py-12 text-gray-400">
                          <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          申請がありません
                        </td>
                      </tr>
                    ) : (
                      data?.applications.map((app) => (
                        <tr
                          key={app.id}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/admin/applications/${app.id}`)}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                            {app.applicationNo}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className="font-semibold text-gray-900">
                                {app.lastName} {app.firstName}
                              </p>
                              {app.examMode && app.examMode !== "一般" && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-bold shrink-0 ${
                                  app.examMode === "特待生" ? "bg-yellow-100 text-yellow-700" : "bg-purple-100 text-purple-700"
                                }`}>
                                  {app.examMode === "特待生" ? "★特待" : "◆推薦"}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {app.lastNameKana} {app.firstNameKana}
                            </p>
                            {app.referrerName && (
                              <p className="text-xs text-gray-400 truncate max-w-[120px]">{app.referrerName}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{app.nationality}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`status-badge ${getJapaneseLevelStyle(app.japaneseLevel)}`}>
                              {app.japaneseLevel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-gray-800 text-xs whitespace-nowrap">{app.lastSchoolName}</p>
                            <p className="text-xs text-gray-400">{app.lastSchoolCountry}</p>
                            {app.priorAttendanceRate && (() => {
                              const rate = parseInt(app.priorAttendanceRate);
                              const color = rate >= 90 ? "text-green-600" : rate >= 80 ? "text-yellow-600" : "text-red-600";
                              return <p className={`text-xs font-bold mt-0.5 ${color}`}>出席率 {app.priorAttendanceRate}</p>;
                            })()}
                          </td>
                          <td className="px-4 py-3 min-w-[160px]">
                            {(app.applicationSchools && app.applicationSchools.length > 0
                              ? app.applicationSchools
                              : [{ priority: 1, schoolName: app.schoolName, department: app.department, result: null }]
                            ).map((s) => (
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
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {app.enrollmentYear}年{app.enrollmentMonth}月
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              app.documents.length > 0
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {app.documents.length}件
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {app.cohort ? (
                              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                                {app.cohort.name}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {app.agent ? (
                              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                                {app.agent.name}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {app.examFeeStatus && (
                              <div className="flex flex-col gap-0.5">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  app.examFeeStatus === "確認済み" ? "bg-green-100 text-green-700" :
                                  app.examFeeStatus === "確認中" ? "bg-yellow-100 text-yellow-700" :
                                  app.examFeeStatus === "免除" ? "bg-gray-100 text-gray-600" :
                                  "bg-red-100 text-red-600"
                                }`}>{app.examFeeStatus}</span>
                                {app.examFeeAmount && (
                                  <span className="text-xs text-gray-400">¥{app.examFeeAmount.toLocaleString()}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className={`status-badge ${getStatusStyle(app.status)}`}>
                                {app.status}
                              </span>
                              {(app.status === "合格" || app.status === "補欠合格") && app.enrollmentProcedure && (() => {
                                const step = getEnrollmentStep(app.enrollmentProcedure!);
                                return (
                                  <span className={`status-badge text-xs ${step.style}`}>
                                    {step.label}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {formatDateTimeJP(app.createdAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Link
                              href={`/admin/applications/${app.id}`}
                              className="text-navy-700 hover:text-navy-900 font-medium text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              詳細 →
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-500">
                  全{data.total}件中 {(page - 1) * 20 + 1}〜{Math.min(page * 20, data.total)}件を表示
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    前へ
                  </button>
                  {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                    .filter((p) => Math.abs(p - page) <= 2)
                    .map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-1.5 text-sm rounded-lg border ${
                          p === page
                            ? "bg-navy-800 text-white border-navy-800"
                            : "border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  <button
                    disabled={page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
