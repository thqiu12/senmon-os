"use client";

import { useState, useEffect } from "react";
import { useUI } from "@/components/ui/toast";

// ===== 面接フィードバックコンポーネント（管理画面・面接レビュー画面で共用） =====
export interface Interviewer { id: string; name: string; role: string | null; }
export interface FeedbackItem {
  id: string;
  interviewerName: string;
  interviewer: Interviewer | null;
  scoreJapanese: number | null;
  scoreMotivation: number | null;
  scorePersonality: number | null;
  scoreAcademic: number | null;
  scoreOverall: number | null;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  recommendation: string;
  createdAt: string;
}

export const RECOMMENDATION_STYLES: Record<string, string> = {
  "合格推薦": "bg-green-100 text-green-800 border-green-300",
  "不合格推薦": "bg-red-100 text-red-800 border-red-300",
  "保留": "bg-yellow-100 text-yellow-800 border-yellow-300",
};

export function InterviewFeedbackCard({ applicationId }: { applicationId: string }) {
  const { confirm } = useUI();
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // フォーム
  const [fInterviewerName, setFInterviewerName] = useState("");
  const [fInterviewerId, setFInterviewerId] = useState("");
  const [fScoreJapanese, setFScoreJapanese] = useState("");
  const [fScoreMotivation, setFScoreMotivation] = useState("");
  const [fScorePersonality, setFScorePersonality] = useState("");
  const [fScoreAcademic, setFScoreAcademic] = useState("");
  const [fScoreOverall, setFScoreOverall] = useState("");
  const [fStrengths, setFStrengths] = useState("");
  const [fConcerns, setFConcerns] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fRecommendation, setFRecommendation] = useState("保留");

  useEffect(() => {
    Promise.all([
      fetch(`/api/interview-feedback?applicationId=${applicationId}`).then(r => r.json()),
      fetch("/api/interviewers").then(r => r.json()),
    ]).then(([fb, iv]) => {
      setFeedbacks(Array.isArray(fb) ? fb : []);
      setInterviewers(Array.isArray(iv) ? iv : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [applicationId]);

  const resetForm = () => {
    setFInterviewerName(""); setFInterviewerId(""); setFScoreJapanese("");
    setFScoreMotivation(""); setFScorePersonality(""); setFScoreAcademic("");
    setFScoreOverall(""); setFStrengths(""); setFConcerns(""); setFNotes("");
    setFRecommendation("保留"); setEditId(null);
  };

  const openEdit = (fb: FeedbackItem) => {
    setEditId(fb.id);
    setFInterviewerName(fb.interviewerName);
    setFInterviewerId(fb.interviewer?.id || "");
    setFScoreJapanese(fb.scoreJapanese?.toString() || "");
    setFScoreMotivation(fb.scoreMotivation?.toString() || "");
    setFScorePersonality(fb.scorePersonality?.toString() || "");
    setFScoreAcademic(fb.scoreAcademic?.toString() || "");
    setFScoreOverall(fb.scoreOverall?.toString() || "");
    setFStrengths(fb.strengths || "");
    setFConcerns(fb.concerns || "");
    setFNotes(fb.notes || "");
    setFRecommendation(fb.recommendation);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!fInterviewerName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        applicationId,
        interviewerName: fInterviewerName.trim(),
        interviewerId: fInterviewerId || null,
        scoreJapanese: fScoreJapanese || null,
        scoreMotivation: fScoreMotivation || null,
        scorePersonality: fScorePersonality || null,
        scoreAcademic: fScoreAcademic || null,
        scoreOverall: fScoreOverall || null,
        strengths: fStrengths || null,
        concerns: fConcerns || null,
        notes: fNotes || null,
        recommendation: fRecommendation,
      };
      const url = editId ? `/api/interview-feedback?id=${editId}` : "/api/interview-feedback";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const updated = await res.json();
        if (editId) {
          setFeedbacks(prev => prev.map(f => f.id === editId ? updated : f));
        } else {
          setFeedbacks(prev => [...prev, updated]);
        }
        resetForm();
        setShowForm(false);
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ title: "フィードバック削除", message: "このフィードバックを削除しますか？", danger: true, okLabel: "削除" });
    if (!ok) return;
    await fetch(`/api/interview-feedback?id=${id}`, { method: "DELETE" });
    setFeedbacks(prev => prev.filter(f => f.id !== id));
  };

  // 集計
  const avgOverall = feedbacks.length > 0 && feedbacks.some(f => f.scoreOverall)
    ? (feedbacks.reduce((s, f) => s + (f.scoreOverall || 0), 0) / feedbacks.filter(f => f.scoreOverall).length).toFixed(1)
    : null;
  const recCounts = { "合格推薦": 0, "不合格推薦": 0, "保留": 0 };
  feedbacks.forEach(f => { if (f.recommendation in recCounts) recCounts[f.recommendation as keyof typeof recCounts]++; });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide">
          面接フィードバック
        </h3>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="text-xs bg-navy-800 text-white px-3 py-1.5 rounded-lg hover:bg-navy-700">
            ＋ 追加
          </button>
        )}
      </div>

      {loading && <p className="text-xs text-gray-400 text-center py-4">読み込み中...</p>}

      {/* 集計サマリー - 1行4列 */}
      {feedbacks.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-navy-800 rounded-xl p-3 text-center text-white">
            <p className="text-2xl font-bold leading-none">{avgOverall || "—"}</p>
            <p className="text-xs opacity-80 mt-1">総合平均 / 5</p>
          </div>
          <div className={`rounded-xl p-3 text-center border-2 ${recCounts["合格推薦"] > 0 ? "bg-green-50 border-green-400" : "bg-gray-50 border-gray-200"}`}>
            <p className={`text-2xl font-bold leading-none ${recCounts["合格推薦"] > 0 ? "text-green-700" : "text-gray-400"}`}>{recCounts["合格推薦"]}</p>
            <p className={`text-xs mt-1 font-medium ${recCounts["合格推薦"] > 0 ? "text-green-600" : "text-gray-400"}`}>合格推薦</p>
          </div>
          <div className={`rounded-xl p-3 text-center border-2 ${recCounts["保留"] > 0 ? "bg-yellow-50 border-yellow-400" : "bg-gray-50 border-gray-200"}`}>
            <p className={`text-2xl font-bold leading-none ${recCounts["保留"] > 0 ? "text-yellow-700" : "text-gray-400"}`}>{recCounts["保留"]}</p>
            <p className={`text-xs mt-1 font-medium ${recCounts["保留"] > 0 ? "text-yellow-600" : "text-gray-400"}`}>保留</p>
          </div>
          <div className={`rounded-xl p-3 text-center border-2 ${recCounts["不合格推薦"] > 0 ? "bg-red-50 border-red-400" : "bg-gray-50 border-gray-200"}`}>
            <p className={`text-2xl font-bold leading-none ${recCounts["不合格推薦"] > 0 ? "text-red-700" : "text-gray-400"}`}>{recCounts["不合格推薦"]}</p>
            <p className={`text-xs mt-1 font-medium ${recCounts["不合格推薦"] > 0 ? "text-red-600" : "text-gray-400"}`}>不合格推薦</p>
          </div>
        </div>
      )}

      {/* フィードバック一覧 */}
      <div className="space-y-2 mb-4">
        {feedbacks.map(fb => (
          <div key={fb.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            {/* ヘッダー行 */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-navy-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {fb.interviewerName.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-sm text-gray-900">{fb.interviewerName}</span>
                  {fb.interviewer?.role && <span className="text-xs text-gray-400 ml-1">/ {fb.interviewer.role}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${RECOMMENDATION_STYLES[fb.recommendation] || RECOMMENDATION_STYLES["保留"]}`}>
                  {fb.recommendation === "合格推薦" ? "合格推薦" : fb.recommendation === "不合格推薦" ? "不合格" : "△ 保留"}
                </span>
                <button onClick={() => openEdit(fb)} className="text-xs text-gray-400 hover:text-navy-600 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors">編集</button>
                <button onClick={() => handleDelete(fb.id)} className="text-xs text-red-400 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50 transition-colors">削除</button>
              </div>
            </div>

            {/* スコア + コメント */}
            <div className="px-4 py-3">
              {/* 評価スコア - 横1行 */}
              <div className="flex items-center gap-4 mb-2 flex-wrap">
                {[
                  { label: "日本語", score: fb.scoreJapanese },
                  { label: "志望動機", score: fb.scoreMotivation },
                  { label: "人柄", score: fb.scorePersonality },
                  { label: "学力", score: fb.scoreAcademic },
                  { label: "総合", score: fb.scoreOverall, highlight: true },
                ].map(({ label, score, highlight }) => (
                  <div key={label} className={`flex items-center gap-1.5 ${highlight ? "pl-3 border-l-2 border-gray-200" : ""}`}>
                    <span className={`text-xs shrink-0 ${highlight ? "font-semibold text-navy-700" : "text-gray-500"}`}>{label}</span>
                    {score ? (
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={`w-3 h-3 rounded-sm ${i <= score ? (highlight ? "bg-navy-700" : "bg-navy-500") : "bg-gray-200"}`} />
                        ))}
                        <span className={`text-xs ml-1 font-bold ${highlight ? "text-navy-700" : "text-gray-600"}`}>{score}</span>
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </div>
                ))}
              </div>

              {/* コメント */}
              {(fb.strengths || fb.concerns || fb.notes) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-gray-100">
                  {fb.strengths && (
                    <p className="text-xs text-gray-600">
                      <span className="font-medium text-green-700">👍</span> {fb.strengths}
                    </p>
                  )}
                  {fb.concerns && (
                    <p className="text-xs text-gray-600">
                      <span className="font-medium text-red-600">⚠️</span> {fb.concerns}
                    </p>
                  )}
                  {fb.notes && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">📌</span> {fb.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {!loading && feedbacks.length === 0 && !showForm && (
          <div className="text-center py-6 text-gray-400">
            <p className="text-2xl mb-1">📋</p>
            <p className="text-xs">まだフィードバックがありません</p>
          </div>
        )}
      </div>

      {/* 入力フォーム */}
      {showForm && (
        <div className="border-2 border-navy-200 rounded-xl p-4 bg-navy-50">
          <p className="text-xs font-bold text-navy-800 mb-3">{editId ? "フィードバックを編集" : "フィードバックを追加"}</p>
          <div className="space-y-3">
            {/* 面接官 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">面接官 <span className="text-red-400">*</span></label>
              {interviewers.length > 0 ? (
                <select className="form-input text-sm" value={fInterviewerId}
                  onChange={(e) => {
                    const iv = interviewers.find(i => i.id === e.target.value);
                    setFInterviewerId(e.target.value);
                    if (iv) setFInterviewerName(iv.name);
                    else setFInterviewerName("");
                  }}>
                  <option value="">手動入力</option>
                  {interviewers.map(iv => <option key={iv.id} value={iv.id}>{iv.name}{iv.role ? `（${iv.role}）` : ""}</option>)}
                </select>
              ) : null}
              {(!fInterviewerId || interviewers.length === 0) && (
                <input type="text" className="form-input text-sm mt-1" placeholder="面接官名を入力"
                  value={fInterviewerName} onChange={(e) => setFInterviewerName(e.target.value)} />
              )}
            </div>

            {/* 評価スコア */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">評価（1〜5点）</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "日本語能力", val: fScoreJapanese, set: setFScoreJapanese },
                  { label: "志望動機", val: fScoreMotivation, set: setFScoreMotivation },
                  { label: "人柄・態度", val: fScorePersonality, set: setFScorePersonality },
                  { label: "学力・専門性", val: fScoreAcademic, set: setFScoreAcademic },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
                    <select className="form-input text-xs py-1.5" value={val} onChange={(e) => set(e.target.value)}>
                      <option value="">—</option>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}点</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-0.5">総合評価</label>
                <select className="form-input text-xs py-1.5" value={fScoreOverall} onChange={(e) => setFScoreOverall(e.target.value)}>
                  <option value="">—</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}点</option>)}
                </select>
              </div>
            </div>

            {/* コメント */}
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">良い点</label>
                <textarea className="form-input text-sm min-h-[50px] resize-y" placeholder="アピールポイント・強み"
                  value={fStrengths} onChange={(e) => setFStrengths(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">懸念点</label>
                <textarea className="form-input text-sm min-h-[50px] resize-y" placeholder="気になる点・課題"
                  value={fConcerns} onChange={(e) => setFConcerns(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">備考</label>
                <textarea className="form-input text-sm min-h-[40px] resize-y" placeholder="その他メモ"
                  value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
              </div>
            </div>

            {/* 推薦 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">推薦判定</label>
              <div className="flex gap-2">
                {(["合格推薦", "保留", "不合格推薦"] as const).map(r => (
                  <label key={r} className={`flex-1 text-center text-xs py-2 rounded-lg border cursor-pointer transition-colors ${fRecommendation === r ? RECOMMENDATION_STYLES[r] + " font-bold" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    <input type="radio" name="rec" value={r} checked={fRecommendation === r} onChange={() => setFRecommendation(r)} className="hidden" />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => { resetForm(); setShowForm(false); }}
                className="flex-1 border border-gray-300 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={handleSave} disabled={saving || !fInterviewerName.trim()}
                className="flex-1 btn-primary text-sm disabled:opacity-50">
                {saving ? "保存中..." : editId ? "更新する" : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
