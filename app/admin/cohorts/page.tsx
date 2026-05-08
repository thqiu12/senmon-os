"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTimeJP } from "@/lib/utils";

const COHORT_STATUSES = ["受付中", "選考中", "完了"];

interface Cohort {
  id: string;
  name: string;
  description: string | null;
  examDate: string | null;
  deadline: string | null;
  status: string;
  isDefault: boolean;
  year: number;
  round: number;
  seqCounter: number;
  createdAt: string;
  _count: { applications: number };
  // デフォルト学費設定
  defaultTuitionPlan: string | null;
  defaultTuitionAmount: string | null;
  defaultTuitionAmount2: string | null;
  defaultTuitionDeadline: string | null;
  defaultTuitionDeadline2: string | null;
  defaultTuitionBankInfo: string | null;
  defaultStep2Deadline: string | null;
  defaultStep3Deadline: string | null;
}

function getCohortStatusStyle(status: string): string {
  const styles: Record<string, string> = {
    受付中: "bg-blue-100 text-blue-800",
    選考中: "bg-yellow-100 text-yellow-800",
    完了: "bg-gray-100 text-gray-700",
  };
  return styles[status] || "bg-gray-100 text-gray-700";
}

export default function CohortsPage() {
  const router = useRouter();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editCohort, setEditCohort] = useState<Cohort | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formExamDate, setFormExamDate] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formStatus, setFormStatus] = useState("受付中");
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formRound, setFormRound] = useState(1);
  // デフォルト学費設定
  const [formTuitionPlan, setFormTuitionPlan] = useState("全額");
  const [formTuitionAmount, setFormTuitionAmount] = useState("");
  const [formTuitionAmount2, setFormTuitionAmount2] = useState("");
  const [formTuitionDeadline, setFormTuitionDeadline] = useState("");
  const [formTuitionDeadline2, setFormTuitionDeadline2] = useState("");
  const [formTuitionBankInfo, setFormTuitionBankInfo] = useState("");
  const [formStep2Deadline, setFormStep2Deadline] = useState("");
  const [formStep3Deadline, setFormStep3Deadline] = useState("");

  const fetchCohorts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cohorts");
      if (res.status === 401) { router.push("/admin"); return; }
      if (!res.ok) throw new Error("取得に失敗しました");
      const data = await res.json();
      setCohorts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCohorts(); }, []);

  const resetTuitionForm = () => {
    setFormTuitionPlan("全額");
    setFormTuitionAmount("");
    setFormTuitionAmount2("");
    setFormTuitionDeadline("");
    setFormTuitionDeadline2("");
    setFormTuitionBankInfo("");
    setFormStep2Deadline("");
    setFormStep3Deadline("");
  };

  const openCreate = () => {
    setEditCohort(null);
    setFormName("");
    setFormDescription("");
    setFormExamDate("");
    setFormDeadline("");
    setFormStatus("受付中");
    setFormIsDefault(false);
    setFormYear(new Date().getFullYear());
    setFormRound(1);
    resetTuitionForm();
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (cohort: Cohort) => {
    setEditCohort(cohort);
    setFormName(cohort.name);
    setFormDescription(cohort.description || "");
    setFormExamDate(cohort.examDate || "");
    setFormDeadline(cohort.deadline || "");
    setFormStatus(cohort.status);
    setFormIsDefault(cohort.isDefault);
    setFormYear(cohort.year || new Date().getFullYear());
    setFormRound(cohort.round || 1);
    setFormTuitionPlan(cohort.defaultTuitionPlan || "全額");
    setFormTuitionAmount(cohort.defaultTuitionAmount || "");
    setFormTuitionAmount2(cohort.defaultTuitionAmount2 || "");
    setFormTuitionDeadline(cohort.defaultTuitionDeadline || "");
    setFormTuitionDeadline2(cohort.defaultTuitionDeadline2 || "");
    setFormTuitionBankInfo(cohort.defaultTuitionBankInfo || "");
    setFormStep2Deadline(cohort.defaultStep2Deadline || "");
    setFormStep3Deadline(cohort.defaultStep3Deadline || "");
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { setFormError("選考名は必須です"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription || null,
        examDate: formExamDate || null,
        deadline: formDeadline || null,
        status: formStatus,
        isDefault: formIsDefault,
        year: formYear,
        round: formRound,
        defaultTuitionPlan:      formTuitionPlan || null,
        defaultTuitionAmount:    formTuitionAmount || null,
        defaultTuitionAmount2:   formTuitionAmount2 || null,
        defaultTuitionDeadline:  formTuitionDeadline || null,
        defaultTuitionDeadline2: formTuitionDeadline2 || null,
        defaultTuitionBankInfo:  formTuitionBankInfo || null,
        defaultStep2Deadline:    formStep2Deadline || null,
        defaultStep3Deadline:    formStep3Deadline || null,
      };
      const url = editCohort ? `/api/cohorts?id=${editCohort.id}` : "/api/cohorts";
      const method = editCohort ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "保存に失敗しました");
      }
      setShowModal(false);
      await fetchCohorts();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/cohorts?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
      await fetchCohorts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "エラーが発生しました");
    }
  };

  const handleDelete = async (cohort: Cohort) => {
    if (!confirm(`「${cohort.name}」を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/cohorts?id=${cohort.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "削除に失敗しました");
      await fetchCohorts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-navy-800 font-bold">専</span>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">選考管理</h1>
              <p className="text-navy-300 text-xs">専門学校 入学出願システム</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-navy-300 hover:text-white text-sm transition-colors">
              ← ダッシュボード
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Top action */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">選考一覧</h2>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新規選考作成
          </button>
        </div>

        {/* Content */}
        {error ? (
          <div className="card text-center py-8 text-red-600">
            <p>{error}</p>
            <button onClick={fetchCohorts} className="btn-primary mt-4">再読み込み</button>
          </div>
        ) : loading ? (
          <div className="card text-center py-16">
            <svg className="animate-spin w-8 h-8 text-navy-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-500 mt-3">読み込み中...</p>
          </div>
        ) : cohorts.length === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <p className="text-lg mb-2">選考がありません</p>
            <p className="text-sm">「新規選考作成」から最初のバッチを作成してください</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cohorts.map((cohort) => (
              <div key={cohort.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-stretch">
                  {/* 左：カラーバー */}
                  <div className={`w-1.5 rounded-l-xl shrink-0 ${cohort.status === "受付中" ? "bg-blue-400" : cohort.status === "選考中" ? "bg-yellow-400" : "bg-gray-300"}`} />

                  <div className="flex-1 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* 左：選考名・説明 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-gray-900 text-base">{cohort.name}</h3>
                          {cohort.isDefault && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">デフォルト</span>
                          )}
                          <select
                            className={`text-xs border rounded-full px-2.5 py-0.5 font-semibold focus:outline-none focus:ring-1 focus:ring-navy-600 cursor-pointer
                              ${cohort.status === "受付中" ? "border-blue-200 bg-blue-50 text-blue-700" :
                                cohort.status === "選考中" ? "border-yellow-200 bg-yellow-50 text-yellow-700" :
                                "border-gray-200 bg-gray-50 text-gray-600"}`}
                            value={cohort.status}
                            onChange={(e) => handleStatusChange(cohort.id, e.target.value)}
                          >
                            {COHORT_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        {cohort.description && (
                          <p className="text-xs text-gray-400 mt-1 truncate max-w-lg">{cohort.description}</p>
                        )}
                      </div>

                      {/* 右：アクション */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-gray-400">{formatDateTimeJP(cohort.createdAt)}</span>
                        <button onClick={() => openEdit(cohort)} className="text-xs text-navy-600 hover:text-navy-900 font-semibold border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 transition-colors">編集</button>
                        <button onClick={() => handleDelete(cohort)} className="text-xs text-red-500 hover:text-red-700 font-semibold border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">削除</button>
                      </div>
                    </div>

                    {/* 下：メトリクス */}
                    <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">申請番号</span>
                        <span className="font-mono text-sm font-bold bg-navy-50 text-navy-700 border border-navy-200 px-2 py-0.5 rounded">
                          {String(cohort.year).slice(-2)}-{cohort.round}-NNN
                        </span>
                        <span className="text-xs text-gray-400">（次: {String(cohort.seqCounter + 1).padStart(3, "0")}）</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">選考日</span>
                        <span className="text-sm font-semibold text-gray-700">{cohort.examDate || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">締切</span>
                        <span className="text-sm font-semibold text-gray-700">{cohort.deadline || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">申請件数</span>
                        <span className="text-sm font-bold text-navy-700 bg-navy-50 border border-navy-200 rounded-full px-2.5 py-0.5">
                          {cohort._count.applications}件
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">
                {editCohort ? "選考を編集" : "新規選考作成"}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}
              <div>
                <label className="form-label">選考名 <span className="form-required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="例: 2026年第1回選考"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">説明</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="選考の説明（任意）"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              {/* 申請番号設定 */}
              <div className="bg-navy-50 border border-navy-200 rounded-lg p-3">
                <p className="text-xs font-bold text-navy-700 mb-2">📋 申請番号の設定</p>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="form-label text-xs">年度 <span className="form-required">*</span></label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="2026"
                      min={2020}
                      max={2099}
                      value={formYear}
                      onChange={(e) => setFormYear(parseInt(e.target.value) || new Date().getFullYear())}
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">選考回数 <span className="form-required">*</span></label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="1"
                      min={1}
                      max={99}
                      value={formRound}
                      onChange={(e) => setFormRound(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>
                <div className="bg-white rounded p-2 text-center">
                  <p className="text-xs text-gray-500">申請番号プレビュー</p>
                  <p className="font-mono font-bold text-navy-800 text-lg">
                    {String(formYear).slice(-2)}-{formRound}-001 〜 {String(formYear).slice(-2)}-{formRound}-999
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">選考日</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="例: 2026年3月15日"
                    value={formExamDate}
                    onChange={(e) => setFormExamDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">出願締切</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="例: 2026年3月1日"
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">ステータス</label>
                <select
                  className="form-input"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                >
                  {COHORT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-navy-600 focus:ring-navy-600"
                  checked={formIsDefault}
                  onChange={(e) => setFormIsDefault(e.target.checked)}
                />
                <span className="text-sm text-gray-700">新規出願のデフォルト選考に設定</span>
              </label>

              {/* デフォルト入学手続き設定 */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-bold text-navy-700 mb-3">💴 入学手続きのデフォルト設定</p>
                <p className="text-xs text-gray-500 mb-3">合格通知時に自動でこの設定が入学手続きに反映されます</p>

                {/* 支払いプラン + 学費締切 */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">支払いプラン</label>
                    <select className="form-input text-sm" value={formTuitionPlan} onChange={e => setFormTuitionPlan(e.target.value)}>
                      <option value="全額">全額一括</option>
                      <option value="分割（2期）">分割（2期）</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">学費納入締切 (STEP1)</label>
                    <input type="date" className="form-input text-sm" value={formTuitionDeadline} onChange={e => setFormTuitionDeadline(e.target.value)} />
                  </div>
                </div>

                {/* 金額 */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{formTuitionPlan === "分割（2期）" ? "第1期金額" : "金額"}</label>
                    <input type="text" className="form-input text-sm" placeholder="例: 350,000円" value={formTuitionAmount} onChange={e => setFormTuitionAmount(e.target.value)} />
                  </div>
                  {formTuitionPlan === "分割（2期）" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">第2期金額</label>
                      <input type="text" className="form-input text-sm" placeholder="例: 200,000円" value={formTuitionAmount2} onChange={e => setFormTuitionAmount2(e.target.value)} />
                    </div>
                  )}
                </div>

                {/* 第2期締切 */}
                {formTuitionPlan === "分割（2期）" && (
                  <div className="mb-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">第2期納入締切</label>
                    <input type="date" className="form-input text-sm" value={formTuitionDeadline2} onChange={e => setFormTuitionDeadline2(e.target.value)} />
                  </div>
                )}

                {/* 書類・署名締切 */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">書類提出締切 (STEP2)</label>
                    <input type="date" className="form-input text-sm" value={formStep2Deadline} onChange={e => setFormStep2Deadline(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">署名締切 (STEP3)</label>
                    <input type="date" className="form-input text-sm" value={formStep3Deadline} onChange={e => setFormStep3Deadline(e.target.value)} />
                  </div>
                </div>

                {/* 振込先 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">振込先情報（学生に表示）</label>
                  <textarea
                    className="form-input text-sm min-h-[80px] resize-y"
                    placeholder={"銀行名：〇〇銀行 〇〇支店\n口座種別：普通\n口座番号：1234567\n口座名義：学校法人〇〇学園"}
                    value={formTuitionBankInfo}
                    onChange={e => setFormTuitionBankInfo(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary"
                disabled={saving}
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="btn-primary flex items-center gap-2"
                disabled={saving}
              >
                {saving && (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {editCohort ? "更新" : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
