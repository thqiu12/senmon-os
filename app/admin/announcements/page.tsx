"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTimeJP } from "@/lib/utils";
import { useUI } from "@/components/ui/toast";

const STATUSES = ["受付中", "書類確認中", "面接待ち", "合格", "補欠合格", "不合格", "保留"];
// ステータス絞り込みの選択肢（先頭2つは特別値）
const STATUS_ALL = "";              // すべて
const STATUS_PASS = "合格＋補欠合格"; // 合格者プリセット（合格＋補欠合格）

interface Announcement {
  id: string;
  title: string;
  content: string;
  targetType: string;
  targetCohortId: string | null;
  targetSchool: string | null;
  targetStatus: string | null;
  sentAt: string | null;
  sentCount: number;
  createdAt: string;
  createdBy: string;
}

interface Cohort {
  id: string;
  name: string;
  _count: { applications: number };
}

// 第N期 × 学校 × ステータス の複合フィルタを人が読めるラベルに
function getTargetLabel(a: Announcement, cohorts: Cohort[]): string {
  const parts: string[] = [];
  if (a.targetCohortId) {
    const cohort = cohorts.find(c => c.id === a.targetCohortId);
    parts.push(cohort ? cohort.name : "指定バッチ");
  }
  if (a.targetSchool) parts.push(a.targetSchool);
  if (a.targetType === "合格者") parts.push("合格＋補欠合格");
  else if (a.targetStatus) parts.push(a.targetStatus);
  return parts.length ? parts.join(" / ") : "全員";
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form（複合フィルタ：選考バッチ × 学校 × ステータス）
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTargetCohortId, setFormTargetCohortId] = useState("");
  const [formTargetSchool, setFormTargetSchool] = useState("");
  const [formTargetStatus, setFormTargetStatus] = useState(STATUS_ALL);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview (対象件数)
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Sending / Deleting
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [annoRes, cohortRes, schoolRes] = await Promise.all([
        fetch("/api/announcements"),
        fetch("/api/cohorts"),
        fetch("/api/announcements/recipients?facets=1"),
      ]);
      if (annoRes.status === 401) { router.push("/admin"); return; }
      if (!annoRes.ok) throw new Error("取得に失敗しました");
      const [annoData, cohortData, schoolData] = await Promise.all([
        annoRes.json(), cohortRes.json(), schoolRes.ok ? schoolRes.json() : { schools: [] },
      ]);
      setAnnouncements(annoData);
      if (Array.isArray(cohortData)) setCohorts(cohortData);
      if (Array.isArray(schoolData?.schools)) setSchools(schoolData.schools);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // 対象件数プレビュー（実送信と同じロジックの API で算出）
  useEffect(() => {
    setPreviewCount(null);
    if (!showForm) return;
    let cancelled = false;
    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams();
        if (formTargetCohortId) params.set("cohortId", formTargetCohortId);
        if (formTargetSchool) params.set("school", formTargetSchool);
        if (formTargetStatus === STATUS_PASS) params.set("targetType", "合格者");
        else if (formTargetStatus) params.set("status", formTargetStatus);
        const res = await fetch(`/api/announcements/recipients?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setPreviewCount(data.count ?? 0);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setPreviewLoading(false); }
    };
    fetchPreview();
    return () => { cancelled = true; };
  }, [showForm, formTargetCohortId, formTargetSchool, formTargetStatus]);

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormTargetCohortId("");
    setFormTargetSchool("");
    setFormTargetStatus(STATUS_ALL);
    setFormError(null);
    setPreviewCount(null);
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError("タイトルと本文は必須です");
      return;
    }
    // 複合フィルタ → 保存形式に変換
    const isPass = formTargetStatus === STATUS_PASS;
    const anyFilter = !!formTargetCohortId || !!formTargetSchool || !!formTargetStatus;
    const targetType = isPass ? "合格者" : anyFilter ? "filter" : "all";
    setFormSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent.trim(),
          targetType,
          targetCohortId: formTargetCohortId || null,
          targetSchool: formTargetSchool || null,
          targetStatus: isPass ? null : (formTargetStatus || null),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "作成に失敗しました");
      }
      setShowForm(false);
      resetForm();
      await fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setFormSaving(false);
    }
  };

  const handleSend = async (announcement: Announcement) => {
    const targetLabel = getTargetLabel(announcement, cohorts);
    const ok = await confirm({
      title: "お知らせを送信",
      message: `「${announcement.title}」を${targetLabel}に送信しますか？\n\nこの操作は取り消せません。`,
      okLabel: "送信",
    });
    if (!ok) return;
    setSendingId(announcement.id);
    try {
      const res = await fetch(`/api/announcements?id=${announcement.id}&action=send`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送信に失敗しました");
      const fail = data.failCount ?? 0;
      if ((data.targets ?? 0) === 0) {
        toast("対象の受信者がいませんでした", "warn");
      } else {
        toast(`送信完了: ${data.sentCount}/${data.targets} 件${fail > 0 ? ` (失敗 ${fail})` : ""}`, fail > 0 ? "warn" : "success");
      }
      await fetchData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "送信に失敗しました", "error");
    } finally {
      setSendingId(null);
    }
  };

  // 未送信のお知らせを削除（送信済みは履歴として保持されるため削除不可）
  const handleDelete = async (announcement: Announcement) => {
    const ok = await confirm({
      title: "お知らせを削除",
      message: `未送信の「${announcement.title}」を削除しますか？`,
      okLabel: "削除",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(announcement.id);
    try {
      const res = await fetch(`/api/announcements?id=${announcement.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "削除に失敗しました");
      toast("お知らせを削除しました", "success");
      await fetchData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "削除に失敗しました", "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title">お知らせ・一括通知</h1>
          <p className="wsdb-topbar-meta">出願者・在校生への通知管理</p>
        </div>
      </div>

      <div>
        {/* Top action */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">お知らせ一覧</h2>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新規作成
          </button>
        </div>

        {/* 新規作成フォーム */}
        {showForm && (
          <div className="card mb-6">
            <h3 className="text-sm font-bold text-navy-700 mb-4">新規お知らせ作成</h3>
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
                {formError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="form-label">タイトル <span className="form-required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="お知らせのタイトル"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">本文 <span className="form-required">*</span></label>
                <textarea
                  className="form-input"
                  rows={6}
                  placeholder="お知らせの本文を入力してください..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">送信対象の絞り込み</label>
                <p className="text-xs text-gray-500 mb-2">選考バッチ・学校・ステータスを組み合わせて絞り込みます（すべて「指定なし」なら全員）。</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 選考バッチ（第N期） */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">選考バッチ（第N期）</label>
                    <select
                      className="form-input"
                      value={formTargetCohortId}
                      onChange={(e) => setFormTargetCohortId(e.target.value)}
                    >
                      <option value="">すべての選考</option>
                      {cohorts.map(c => (
                        <option key={c.id} value={c.id}>{c.name}（{c._count.applications}件）</option>
                      ))}
                    </select>
                  </div>
                  {/* 学校 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">学校</label>
                    <select
                      className="form-input"
                      value={formTargetSchool}
                      onChange={(e) => setFormTargetSchool(e.target.value)}
                    >
                      <option value="">すべての学校</option>
                      {schools.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {/* ステータス */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">ステータス</label>
                    <select
                      className="form-input"
                      value={formTargetStatus}
                      onChange={(e) => setFormTargetStatus(e.target.value)}
                    >
                      <option value={STATUS_ALL}>すべてのステータス</option>
                      <option value={STATUS_PASS}>合格＋補欠合格</option>
                      {STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 対象件数プレビュー */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  {previewLoading ? (
                    "対象件数を計算中..."
                  ) : previewCount !== null ? (
                    <span>送信対象: <strong>{previewCount}件</strong></span>
                  ) : (
                    "対象を選択すると件数が表示されます"
                  )}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="btn-secondary"
                  disabled={formSaving}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleCreate}
                  className="btn-primary flex items-center gap-2"
                  disabled={formSaving}
                >
                  {formSaving && (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  作成（送信前に確認）
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {error ? (
          <div className="card text-center py-8 text-red-600">
            <p>{error}</p>
            <button onClick={fetchData} className="btn-primary mt-4">再読み込み</button>
          </div>
        ) : loading ? (
          <div className="card text-center py-16">
            <svg className="animate-spin w-8 h-8 text-navy-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-500 mt-3">読み込み中...</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <p className="text-lg mb-2">お知らせがありません</p>
            <p className="text-sm">「新規作成」からお知らせを作成してください</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900 text-sm">{a.title}</h3>
                      {a.sentAt ? (
                        <span className="status-badge bg-green-100 text-green-800">送信済み</span>
                      ) : (
                        <span className="status-badge bg-gray-100 text-gray-600">未送信</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      対象: {getTargetLabel(a, cohorts)}
                      {a.sentAt && ` · 送信日時: ${formatDateTimeJP(a.sentAt)} · ${a.sentCount}件に送信`}
                      {!a.sentAt && ` · 作成日: ${formatDateTimeJP(a.createdAt)}`}
                    </p>
                    <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-line line-clamp-3">
                      {a.content}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {!a.sentAt ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSend(a)}
                          disabled={sendingId === a.id || deletingId === a.id}
                          className="btn-primary text-sm flex items-center gap-2"
                        >
                          {sendingId === a.id ? (
                            <>
                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              送信中...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                              送信
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(a)}
                          disabled={sendingId === a.id || deletingId === a.id}
                          title="削除（未送信のみ）"
                          aria-label="削除"
                          className="text-sm flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition disabled:opacity-50"
                        >
                          {deletingId === a.id ? (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-xs text-green-600 font-medium">送信済み</p>
                        <p className="text-xs text-gray-400">{a.sentCount}件</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
