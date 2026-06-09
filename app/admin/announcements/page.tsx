"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTimeJP } from "@/lib/utils";
import { useUI } from "@/components/ui/toast";

const TARGET_TYPES = [
  { value: "all", label: "全員" },
  { value: "合格者", label: "合格者のみ（合格・補欠合格）" },
  { value: "specific_cohort", label: "バッチ指定" },
  { value: "status_filter", label: "ステータス指定" },
];

const STATUSES = ["受付中", "書類確認中", "面接待ち", "合格", "補欠合格", "不合格", "保留"];

interface Announcement {
  id: string;
  title: string;
  content: string;
  targetType: string;
  targetCohortId: string | null;
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

function getTargetLabel(a: Announcement, cohorts: Cohort[]): string {
  if (a.targetType === "all") return "全員";
  if (a.targetType === "合格者") return "合格・補欠合格者";
  if (a.targetType === "specific_cohort") {
    const cohort = cohorts.find(c => c.id === a.targetCohortId);
    return cohort ? `バッチ: ${cohort.name}` : "バッチ指定";
  }
  if (a.targetType === "status_filter") return `ステータス: ${a.targetStatus || "—"}`;
  return a.targetType;
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTargetType, setFormTargetType] = useState("all");
  const [formTargetCohortId, setFormTargetCohortId] = useState("");
  const [formTargetStatus, setFormTargetStatus] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview (対象件数)
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Sending
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [annoRes, cohortRes] = await Promise.all([
        fetch("/api/announcements"),
        fetch("/api/cohorts"),
      ]);
      if (annoRes.status === 401) { router.push("/admin"); return; }
      if (!annoRes.ok) throw new Error("取得に失敗しました");
      const [annoData, cohortData] = await Promise.all([annoRes.json(), cohortRes.json()]);
      setAnnouncements(annoData);
      if (Array.isArray(cohortData)) setCohorts(cohortData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // 対象件数プレビュー
  useEffect(() => {
    setPreviewCount(null);
    if (!showForm) return;
    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({ limit: "1000", page: "1" });
        if (formTargetType === "合格者") params.set("status", "合格");
        else if (formTargetType === "specific_cohort" && formTargetCohortId) params.set("cohortId", formTargetCohortId);
        else if (formTargetType === "status_filter" && formTargetStatus) params.set("status", formTargetStatus);
        const res = await fetch(`/api/applications?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (formTargetType === "合格者") {
            // 合格+補欠合格を全取得してカウント
            const res2 = await fetch("/api/applications?status=補欠合格&limit=1000&page=1");
            const data2 = res2.ok ? await res2.json() : { total: 0 };
            setPreviewCount(data.total + data2.total);
          } else {
            setPreviewCount(data.total);
          }
        }
      } catch { /* ignore */ }
      finally { setPreviewLoading(false); }
    };
    fetchPreview();
  }, [showForm, formTargetType, formTargetCohortId, formTargetStatus]);

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormTargetType("all");
    setFormTargetCohortId("");
    setFormTargetStatus("");
    setFormError(null);
    setPreviewCount(null);
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError("タイトルと本文は必須です");
      return;
    }
    if (formTargetType === "specific_cohort" && !formTargetCohortId) {
      setFormError("バッチを選択してください");
      return;
    }
    if (formTargetType === "status_filter" && !formTargetStatus) {
      setFormError("ステータスを選択してください");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent.trim(),
          targetType: formTargetType,
          targetCohortId: formTargetType === "specific_cohort" ? formTargetCohortId : null,
          targetStatus: formTargetType === "status_filter" ? formTargetStatus : null,
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
      if (!data.smtpEnabled) {
        toast(`対象: ${data.targets ?? data.sentCount}件 / SMTP未設定のため実送信はスキップ`, "warn");
      } else {
        const fail = data.failCount ?? 0;
        toast(`送信完了: ${data.sentCount}/${data.targets} 件${fail > 0 ? ` (失敗 ${fail})` : ""}`, fail > 0 ? "warn" : "success");
      }
      await fetchData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "送信に失敗しました", "error");
    } finally {
      setSendingId(null);
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
                <label className="form-label">送信対象</label>
                <select
                  className="form-input"
                  value={formTargetType}
                  onChange={(e) => { setFormTargetType(e.target.value); }}
                >
                  {TARGET_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {formTargetType === "specific_cohort" && (
                <div>
                  <label className="form-label">バッチを選択</label>
                  <select
                    className="form-input"
                    value={formTargetCohortId}
                    onChange={(e) => setFormTargetCohortId(e.target.value)}
                  >
                    <option value="">— バッチを選択 —</option>
                    {cohorts.map(c => (
                      <option key={c.id} value={c.id}>{c.name}（{c._count.applications}件）</option>
                    ))}
                  </select>
                </div>
              )}
              {formTargetType === "status_filter" && (
                <div>
                  <label className="form-label">ステータスを選択</label>
                  <select
                    className="form-input"
                    value={formTargetStatus}
                    onChange={(e) => setFormTargetStatus(e.target.value)}
                  >
                    <option value="">— ステータスを選択 —</option>
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

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
                      <button
                        onClick={() => handleSend(a)}
                        disabled={sendingId === a.id}
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
