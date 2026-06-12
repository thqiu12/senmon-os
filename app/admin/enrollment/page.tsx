"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUI } from "@/components/ui/toast";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/Icon";

// ─── 型定義 ───────────────────────────────────────────────
interface EP {
  id: string;
  status: string;
  publishedAt: string | null;
  tuitionPaid: boolean;
  tuitionPaidAt: string | null;
  docSubmitted: boolean;
  docSubmittedAt: string | null;
  schoolConfirmed: boolean;
  schoolConfirmedAt: string | null;
  admitLetterIssued: boolean;
  admitLetterIssuedAt: string | null;
  ceremonyNotified: boolean;
  visaGuideNotified: boolean;
  adminNote: string | null;
  visaStatus: string;
  dormApply: boolean;
  dormStatus: string;
  updatedAt: string;
}

interface EnrollmentRow {
  id: string;
  applicationNo: string;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  status: string;
  schoolName: string;
  department: string;
  enrollmentYear: string;
  enrollmentMonth: string;
  cohort: { id: string; name: string } | null;
  createdAt: string;
  ep: EP | null;
  step: string;
}

// ─── ステップ定義 ─────────────────────────────────────────
const STEPS: { key: string; label: string; icon: IconName; color: string }[] = [
  { key: "all",          label: "全員",         icon: "users",     color: "gray" },
  { key: "not_started",  label: "手続き未案内", icon: "inbox",     color: "slate" },
  { key: "step1",        label: "学費振込待ち", icon: "yen",       color: "blue" },
  { key: "step2",        label: "書類提出待ち", icon: "doc",       color: "cyan" },
  { key: "step3",        label: "署名完了",     icon: "signature", color: "teal" },
  { key: "schoolConfirm",label: "学校承認待ち", icon: "school",    color: "indigo" },
  { key: "admitLetter",  label: "許可書発行済", icon: "award",     color: "purple" },
];

const STEP_STYLES: Record<string, { badge: string; row: string }> = {
  not_started:  { badge: "bg-slate-100 text-slate-700",   row: "" },
  announced:    { badge: "bg-sky-100 text-sky-700",       row: "" },
  step1:        { badge: "bg-blue-100 text-blue-800",     row: "bg-blue-50/30" },
  step2:        { badge: "bg-cyan-100 text-cyan-800",     row: "bg-cyan-50/30" },
  step2done:    { badge: "bg-teal-100 text-teal-800",     row: "bg-teal-50/30" },
  step3done:    { badge: "bg-teal-100 text-teal-800",     row: "bg-teal-50/30" },
  schoolConfirm:{ badge: "bg-indigo-100 text-indigo-800", row: "bg-indigo-50/20" },
  admitLetter:  { badge: "bg-purple-100 text-purple-800", row: "bg-purple-50/20" },
};

const STEP_LABELS: Record<string, string> = {
  not_started:   "未案内",
  announced:     "案内済み",
  step1:         "振込待ち",
  step2:         "書類待ち",
  step2done:     "書類提出済",
  step3done:     "署名完了",
  schoolConfirm: "学校承認待ち",
  admitLetter:   "許可書発行済",
};

function fmt(dt: string | null | undefined): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── メインコンポーネント ─────────────────────────────────
export default function EnrollmentManagementPage() {
  const router = useRouter();
  const { confirm } = useUI();
  const [adminRole, setAdminRole] = useState<string>("");
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setAdminRole(d?.user?.role || ""))
      .catch(() => {});
  }, []);
  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stepFilter, setStepFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // メモ編集モーダル
  const [noteModal, setNoteModal] = useState<{ id: string; note: string } | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  // ステップカウント
  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stepFilter !== "all") params.set("step", stepFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/enrollment-list?${params}`);
      if (res.status === 401) { router.push("/admin"); return; }
      const data: EnrollmentRow[] = await res.json();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [stepFilter, search, router]);

  // 全件のカウントを別途取得（タブ数字用）
  const fetchCounts = useCallback(async () => {
    const res = await fetch("/api/admin/enrollment-list");
    if (!res.ok) return;
    const all: EnrollmentRow[] = await res.json();
    const c: Record<string, number> = { all: all.length };
    for (const row of all) {
      const s = row.step === "announced" ? "not_started" : row.step;
      c[s] = (c[s] || 0) + 1;
    }
    // step2 まとめ
    c["step2"] = (c["step2"] || 0) + (c["step2done"] || 0);
    setCounts(c);
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val); }, 400);
  };

  // 管理メモ保存
  const saveNote = async () => {
    if (!noteModal) return;
    setNoteSaving(true);
    try {
      await fetch("/api/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: noteModal.id, adminNote: noteModal.note }),
      });
      setNoteModal(null);
      fetchRows();
      fetchCounts();
    } finally {
      setNoteSaving(false);
    }
  };

  // 学校承認
  const confirmSchool = async (appId: string, appNo: string) => {
    const ok = await confirm({ title: "学校承認", message: `「${appNo}」の学校承認を記録しますか？`, okLabel: "記録" });
    if (!ok) return;
    await fetch("/api/enrollment/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: appId, action: "schoolConfirm" }),
    });
    fetchRows(); fetchCounts();
  };

  // 許可書発行記録
  const issueAdmitLetter = async (appId: string, appNo: string) => {
    const ok = await confirm({ title: "入学許可書発行", message: `「${appNo}」の入学許可書発行を記録しますか？`, okLabel: "発行" });
    if (!ok) return;
    await fetch("/api/enrollment/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: appId, action: "admitLetter" }),
    });
    fetchRows(); fetchCounts();
  };

  const isSuperAdmin = adminRole === "super_admin" || adminRole === "admin";

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title">入学手続き管理</h1>
          <p className="wsdb-topbar-meta">合格者の手続き進捗一覧</p>
        </div>
      </div>

      <div>

        {/* ===== ステップタブ ===== */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5 overflow-hidden">
          <div className="flex overflow-x-auto divide-x divide-gray-100">
            {STEPS.map(s => {
              const count = counts[s.key] ?? 0;
              const active = stepFilter === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setStepFilter(s.key)}
                  className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-4 border-b-2 transition whitespace-nowrap min-w-[6.75rem]
                    ${active ? "border-navy-700 bg-navy-50 text-navy-800" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                >
                  <Icon name={s.icon} className="w-5 h-5 opacity-80" />
                  <span className="text-[11px] font-medium leading-none">{s.label}</span>
                  <span className={`text-xl font-bold leading-none ${active ? "text-navy-700" : "text-gray-700"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== 検索 & フィルター ===== */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-56">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              className="form-input pl-9 w-full"
              placeholder="氏名・申請番号で検索..."
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>
          <button
            onClick={() => { fetchRows(); fetchCounts(); }}
            className="px-4 py-2 text-sm font-semibold bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5"
          >
            更新
          </button>
          <span className="text-sm text-gray-400">{rows.length}件表示</span>
        </div>

        {/* ===== テーブル ===== */}
        {loading ? (
          <SkeletonList rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="📭"
            title="該当する学生がいません"
            description="フィルター条件を変更するか、合格者の入学手続きが開始されるまでお待ちください。"
          />
        ) : (
          <>
            {/* ===== モバイルカードビュー (md未満) ===== */}
            <div className="block md:hidden space-y-3 mb-4">
              {rows.map(row => {
                const stepStyle = STEP_STYLES[row.step] ?? { badge: "bg-gray-100 text-gray-600", row: "" };
                return (
                  <div key={row.id} className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${stepStyle.row}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{row.lastName} {row.firstName}</p>
                          {row.status === "補欠合格" && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold">補欠</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{row.lastNameKana} {row.firstNameKana}</p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${stepStyle.badge}`}>
                        {STEP_LABELS[row.step] ?? row.step}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-gray-400 mb-2">{row.applicationNo}</p>
                    <div className="text-xs text-gray-600 space-y-0.5 mb-3">
                      <p className="truncate font-medium">{row.schoolName}</p>
                      <p className="text-gray-400">{row.department}</p>
                      <p className="text-gray-400">{row.enrollmentYear}年{row.enrollmentMonth}月入学</p>
                    </div>
                    <div className="flex justify-end">
                      <Link
                        href={`/admin/applications/${row.id}`}
                        className="text-navy-700 hover:text-navy-900 font-medium text-xs"
                      >
                        詳細                       </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ===== デスクトップテーブルビュー (md以上) ===== */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-navy-800 text-white">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">申請番号</th>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">氏名</th>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">志望校</th>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">入学</th>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">現在のステップ</th>
                    <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">学費</th>
                    <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">書類</th>
                    <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">署名</th>
                    <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">学校承認</th>
                    <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">許可書</th>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">メモ</th>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">更新日</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(row => {
                    const stepStyle = STEP_STYLES[row.step] ?? { badge: "bg-gray-100 text-gray-600", row: "" };
                    const ep = row.ep;
                    return (
                      <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${stepStyle.row}`}>
                        {/* 申請番号 */}
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                          {row.applicationNo}
                          {row.status === "補欠合格" && (
                            <span className="ml-1 text-xs bg-yellow-100 text-yellow-700 px-1 rounded">補欠</span>
                          )}
                        </td>

                        {/* 氏名 */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-semibold text-gray-900">{row.lastName} {row.firstName}</p>
                          <p className="text-xs text-gray-400">{row.lastNameKana} {row.firstNameKana}</p>
                        </td>

                        {/* 志望校 */}
                        <td className="px-4 py-3">
                          <p className="text-xs text-gray-800 whitespace-nowrap">{row.schoolName}</p>
                          <p className="text-xs text-gray-400">{row.department}</p>
                        </td>

                        {/* 入学 */}
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {row.enrollmentYear}年{row.enrollmentMonth}月
                        </td>

                        {/* 現在ステップ */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${stepStyle.badge}`}>
                            {STEP_LABELS[row.step] ?? row.step}
                          </span>
                          {ep?.publishedAt && (
                            <p className="text-xs text-gray-400 mt-0.5">案内：{fmt(ep.publishedAt)}</p>
                          )}
                        </td>

                        {/* 学費 */}
                        <td className="px-3 py-3 text-center">
                          {ep ? (
                            ep.tuitionPaid ? (
                              <div>
                                <span className="text-green-600 text-lg">✓</span>
                                <p className="text-xs text-gray-400">{fmt(ep.tuitionPaidAt)}</p>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-lg">—</span>
                            )
                          ) : <span className="text-gray-200 text-lg">—</span>}
                        </td>

                        {/* 書類 */}
                        <td className="px-3 py-3 text-center">
                          {ep ? (
                            ep.docSubmitted ? (
                              <div>
                                <span className="text-green-600 text-lg">✓</span>
                                <p className="text-xs text-gray-400">{fmt(ep.docSubmittedAt)}</p>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-lg">—</span>
                            )
                          ) : <span className="text-gray-200 text-lg">—</span>}
                        </td>

                        {/* 署名 */}
                        <td className="px-3 py-3 text-center">
                          {ep ? (
                            (ep.status === "STEP3完了" || ep.status === "完了") ? (
                              <span className="text-green-600 text-lg">✓</span>
                            ) : (
                              <span className="text-gray-300 text-lg">—</span>
                            )
                          ) : <span className="text-gray-200 text-lg">—</span>}
                        </td>

                        {/* 学校承認 */}
                        <td className="px-3 py-3 text-center">
                          {ep ? (
                            ep.schoolConfirmed ? (
                              <div>
                                <span className="text-green-600 text-lg">✓</span>
                                <p className="text-xs text-gray-400">{fmt(ep.schoolConfirmedAt)}</p>
                              </div>
                            ) : isSuperAdmin && (ep.status === "STEP3完了" || ep.status === "完了") ? (
                              <button
                                onClick={() => confirmSchool(row.id, row.applicationNo)}
                                className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg hover:bg-indigo-700 transition font-semibold"
                              >
                                承認する
                              </button>
                            ) : (
                              <span className="text-gray-300 text-lg">—</span>
                            )
                          ) : <span className="text-gray-200 text-lg">—</span>}
                        </td>

                        {/* 許可書 */}
                        <td className="px-3 py-3 text-center">
                          {ep ? (
                            ep.admitLetterIssued ? (
                              <div>
                                <span className="text-purple-600 text-lg">✓</span>
                                <p className="text-xs text-gray-400">{fmt(ep.admitLetterIssuedAt)}</p>
                              </div>
                            ) : isSuperAdmin && ep.schoolConfirmed ? (
                              <button
                                onClick={() => issueAdmitLetter(row.id, row.applicationNo)}
                                className="text-xs bg-purple-600 text-white px-2 py-1 rounded-lg hover:bg-purple-700 transition font-semibold"
                              >
                                発行記録
                              </button>
                            ) : (
                              <span className="text-gray-300 text-lg">—</span>
                            )
                          ) : <span className="text-gray-200 text-lg">—</span>}
                        </td>

                        {/* メモ */}
                        <td className="px-4 py-3 max-w-[160px]">
                          <div className="flex items-start gap-1">
                            {ep?.adminNote ? (
                              <p className="text-xs text-gray-600 truncate flex-1">{ep.adminNote}</p>
                            ) : (
                              <p className="text-xs text-gray-300 flex-1">—</p>
                            )}
                            <button
                              onClick={() => setNoteModal({ id: row.id, note: ep?.adminNote ?? "" })}
                              className="text-gray-400 hover:text-navy-700 shrink-0"
                              title="メモを編集"
                            >
                                                          </button>
                          </div>
                        </td>

                        {/* 更新日 */}
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {ep ? fmt(ep.updatedAt) : "—"}
                        </td>

                        {/* 詳細リンク */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            href={`/admin/applications/${row.id}`}
                            className="text-navy-700 hover:text-navy-900 font-medium text-xs"
                          >
                            詳細                           </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}
      </div>

      {/* ===== メモ編集モーダル ===== */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">管理メモを編集</h3>
              <button onClick={() => setNoteModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-5">
              <textarea
                value={noteModal.note}
                onChange={e => setNoteModal(m => m ? { ...m, note: e.target.value } : null)}
                rows={4}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
                placeholder="管理者用メモを入力..."
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                キャンセル
              </button>
              <button
                onClick={saveNote}
                disabled={noteSaving}
                className="px-5 py-2 text-sm font-semibold text-white bg-navy-800 rounded-lg hover:bg-navy-700 transition disabled:opacity-50"
              >
                {noteSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
