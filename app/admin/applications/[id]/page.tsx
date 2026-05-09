"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getStatusStyle,
  getJapaneseLevelStyle,
  formatDateTimeJP,
  formatFileSize,
} from "@/lib/utils";

// ===== 面接フィードバックコンポーネント =====
interface Interviewer { id: string; name: string; role: string | null; }
interface FeedbackItem {
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

const SCORE_LABELS = ["", "1 不可", "2 可", "3 良", "4 優", "5 秀"];
const RECOMMENDATION_STYLES: Record<string, string> = {
  "合格推薦": "bg-green-100 text-green-800 border-green-300",
  "不合格推薦": "bg-red-100 text-red-800 border-red-300",
  "保留": "bg-yellow-100 text-yellow-800 border-yellow-300",
};

function ScoreBar({ score }: { score: number | null }) {
  if (!score) return <span className="text-gray-300 text-xs">未評価</span>;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={`w-4 h-4 rounded-sm ${i <= score ? "bg-navy-600" : "bg-gray-200"}`} />
      ))}
      <span className="text-xs text-gray-500 ml-1">{score}</span>
    </div>
  );
}

function InterviewFeedbackCard({ applicationId }: { applicationId: string }) {
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
    if (!confirm("このフィードバックを削除しますか？")) return;
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
          📝 面接フィードバック
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
                  {fb.recommendation === "合格推薦" ? "✓ 合格推薦" : fb.recommendation === "不合格推薦" ? "✗ 不合格" : "△ 保留"}
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
                <label className="block text-xs text-gray-600 mb-0.5">👍 良い点</label>
                <textarea className="form-input text-sm min-h-[50px] resize-y" placeholder="アピールポイント・強み"
                  value={fStrengths} onChange={(e) => setFStrengths(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">⚠️ 懸念点</label>
                <textarea className="form-input text-sm min-h-[50px] resize-y" placeholder="気になる点・課題"
                  value={fConcerns} onChange={(e) => setFConcerns(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">📌 備考</label>
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
// ===== 面接フィードバックコンポーネント END =====

const STATUSES = ["受付中", "書類確認中", "面接待ち", "合格", "補欠合格", "不合格", "保留", "辞退"];

interface Agent {
  id: string;
  name: string;
  country: string;
  contactName: string | null;
  contactEmail: string | null;
  isActive: boolean;
}

interface Document {
  id: string;
  docType: string;
  fileName: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

interface AdminNote {
  id: string;
  content: string;
  createdAt: string;
  author: string;
}

interface EnrollmentProcedure {
  id: string;
  applicationId: string;
  instructions: string | null;
  deadline: string | null;
  publishedAt: string | null;
  status: string;
  studentMemo: string | null;
  completedAt: string | null;
  step1Deadline: string | null;
  step2Deadline: string | null;
  step3Deadline: string | null;
  tuitionPlan: string;
  tuitionPaid: boolean;
  tuitionPaidAt: string | null;
  tuitionAmount: string | null;
  tuitionAmount2: string | null;
  tuitionDeadline2: string | null;
  tuitionBankInfo: string | null;
  docSubmitted: boolean;
  docSubmittedAt: string | null;
  docChecklist: string | null;
  visaStatus: string;
  visaNote: string | null;
  dormApply: boolean;
  dormStatus: string;
  dormNote: string | null;
  adminNote: string | null;
  // 学校承認フロー
  schoolConfirmed: boolean;
  schoolConfirmedAt: string | null;
  admitLetterIssued: boolean;
  admitLetterIssuedAt: string | null;
  ceremonyNotified: boolean;
  ceremonyDate: string | null;
  ceremonyPlace: string | null;
  ceremonyNotes: string | null;
  visaGuideNotified: boolean;
  visaGuideNotes: string | null;
}

interface EnrollmentSignature {
  id: string;
  applicationId: string;
  signatureData: string;
  signedAt: string;
  signerName: string;
}

interface Application {
  id: string;
  applicationNo: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string;
  gender: string;
  nationality: string;
  phone: string;
  email: string;
  postalCode: string;
  prefecture: string;
  city: string;
  address: string;
  addressDetail: string | null;
  residenceStatus: string | null;
  residenceExpiry: string | null;
  japaneseLevel: string;
  jlptCertified: boolean;
  schoolName: string;
  department: string;
  course: string | null;
  enrollmentYear: string;
  enrollmentMonth: string;
  applicationReason: string;
  lastSchoolName: string;
  lastSchoolCountry: string;
  lastSchoolGraduate: string;
  workExperience: string | null;
  adminMemo: string | null;
  documents: Document[];
  adminNotes: AdminNote[];
  interviewDate: string | null;
  interviewTime: string | null;
  interviewPlace: string | null;
  interviewNotes: string | null;
  interviewEmailSent: boolean;
  resultEmailSent: boolean;
  examMode: string;
  referrerName: string | null;
  referrerType: string | null;
  examFeeAmount: number | null;
  examFeeStatus: string;
  examFeeReceiptUrl: string | null;
  examFeeNote: string | null;
  enrollmentProcedure: EnrollmentProcedure | null;
  enrollmentSignature: EnrollmentSignature | null;
  agentId: string | null;
  agent: Agent | null;
  cohortId: string | null;
  cohort: { id: string; name: string } | null;
  applicationSchools: ApplicationSchoolEntry[];
}

interface ApplicationSchoolEntry {
  id: string;
  priority: number;
  schoolName: string;
  department: string;
  course: string | null;
  enrollmentYear: string;
  enrollmentMonth: string;
  result: string | null;
  memo: string | null;
}

function InfoRow({ label, value }: { label: string; value: string | boolean | null | undefined }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2.5 text-sm border-b border-gray-100 last:border-0">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="col-span-2 text-gray-900">
        {value === true ? "あり" : value === false ? "なし" : value || <span className="text-gray-400">—</span>}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mb-4">
      <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-4 pb-2 border-b border-gray-200">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Status management
  const [selectedStatus, setSelectedStatus] = useState("");
  const [statusSaved, setStatusSaved] = useState(false);
  const [sendResultEmail, setSendResultEmail] = useState(true);

  // Memo
  const [adminMemo, setAdminMemo] = useState("");
  const [memoSaved, setMemoSaved] = useState(false);

  // Note
  const [newNote, setNewNote] = useState("");
  const [noteAdding, setNoteAdding] = useState(false);

  // Interview settings
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [interviewPlace, setInterviewPlace] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [interviewSaving, setInterviewSaving] = useState(false);
  const [interviewSaved, setInterviewSaved] = useState(false);

  // Agent
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentSaved, setAgentSaved] = useState(false);

  // Cohort
  const [cohorts, setCohorts] = useState<{id: string; name: string; status: string}[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string>("");
  const [cohortSaving, setCohortSaving] = useState(false);
  const [cohortSaved, setCohortSaved] = useState(false);

  // 志望校合否
  const [schoolResultSaving, setSchoolResultSaving] = useState<string | null>(null);
  const [schoolResultSaved, setSchoolResultSaved] = useState<string | null>(null);

  // 選考区分・推薦
  const [examModeEdit, setExamModeEdit] = useState<string>("");
  const [referrerNameEdit, setReferrerNameEdit] = useState<string>("");
  const [referrerTypeEdit, setReferrerTypeEdit] = useState<string>("");
  const [examModeSaving, setExamModeSaving] = useState(false);
  const [examModeSaved, setExamModeSaved] = useState(false);

  // Enrollment procedure
  const [enrollInstructions, setEnrollInstructions] = useState("");
  const [enrollDeadline, setEnrollDeadline] = useState("");
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollSaved, setEnrollSaved] = useState(false);
  const [enrollPublished, setEnrollPublished] = useState(false);
  const [enrollStatus, setEnrollStatus] = useState("未開始");
  const [enrollStudentMemo, setEnrollStudentMemo] = useState("");
  const [enrollCompletedAt, setEnrollCompletedAt] = useState<string | null>(null);
  // ステップ別締切
  const [step1Deadline, setStep1Deadline] = useState("");
  const [step2Deadline, setStep2Deadline] = useState("");
  const [step3Deadline, setStep3Deadline] = useState("");
  // 学費
  const [tuitionPlan, setTuitionPlan] = useState("全額");
  const [tuitionPaid, setTuitionPaid] = useState(false);
  const [tuitionAmount, setTuitionAmount] = useState("");
  const [tuitionAmount2, setTuitionAmount2] = useState("");
  const [tuitionDeadline2, setTuitionDeadline2] = useState("");
  const [tuitionBankInfo, setTuitionBankInfo] = useState("");
  // 書類
  const [docSubmitted, setDocSubmitted] = useState(false);
  const [docChecklist, setDocChecklist] = useState<{name: string; required: boolean; done: boolean}[]>([
    { name: "入学誓約書", required: true, done: false },
    { name: "健康診断書", required: true, done: false },
    { name: "最終学歴証明書（原本）", required: true, done: false },
    { name: "パスポートコピー", required: true, done: false },
    { name: "在留カードコピー", required: false, done: false },
    { name: "証明写真（4枚）", required: true, done: false },
  ]);
  // ビザ
  const [visaStatus, setVisaStatus] = useState("未申請");
  const [visaNote, setVisaNote] = useState("");
  // 寮
  const [dormApply, setDormApply] = useState(false);
  const [dormStatus, setDormStatus] = useState("未申請");
  const [dormNote, setDormNote] = useState("");
  // 管理メモ
  const [enrollAdminNote, setEnrollAdminNote] = useState("");
  // 学校承認フロー
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [ceremonyDate, setCeremonyDate] = useState("");
  const [ceremonyPlace, setCeremonyPlace] = useState("");
  const [ceremonyNotes, setCeremonyNotes] = useState("");
  const [visaGuideNotes, setVisaGuideNotes] = useState("");

  // タブ
  type TabKey = "basic"|"screening"|"schools"|"documents"|"enrollment";
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const TABS: {key: TabKey; label: string}[] = [
    {key:"basic", label:"📋 基本情報"},
    {key:"screening", label:"🔍 選考・審査"},
    {key:"schools", label:"🏫 志望校"},
    {key:"documents", label:"📄 書類"},
    {key:"enrollment", label:"🎓 入学手続き"},
  ];

  // 書類確認チェックリスト（提出前書類の事務チェック）
  const DOC_CHECK_ITEMS = ["パスポートコピー","卒業証明書","成績証明書","日本語能力証明書","証明写真","在職証明書（社会人）","経費支弁書","残高証明書"];
  const [docCheckState, setDocCheckState] = useState<Record<string,{checked:boolean;checkedAt?:string}>>({});
  const [docCheckSaving, setDocCheckSaving] = useState(false);
  const [docCheckSaved, setDocCheckSaved] = useState(false);

  // 筆記試験成績
  const [writtenExamDate, setWrittenExamDate] = useState("");
  const [writtenExamScoreReading, setWrittenExamScoreReading] = useState<string>("");
  const [writtenExamScoreGrammar, setWrittenExamScoreGrammar] = useState<string>("");
  const [writtenExamScoreGeneral, setWrittenExamScoreGeneral] = useState<string>("");
  const [writtenExamResult, setWrittenExamResult] = useState<string>("採点中");
  const [writtenExamNotes, setWrittenExamNotes] = useState<string>("");
  const [writtenExamSaving, setWrittenExamSaving] = useState(false);
  const [writtenExamSaved, setWrittenExamSaved] = useState(false);

  const saveDocCheck = async () => {
    setDocCheckSaving(true);
    try {
      await fetch(`/api/applications/${id}`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({content: "[DOC_CHECKLIST]"+JSON.stringify(docCheckState), isInternal: true}),
      });
      setDocCheckSaved(true); setTimeout(()=>setDocCheckSaved(false),2000);
    } finally { setDocCheckSaving(false); }
  };

  useEffect(() => {
    fetch("/api/agents").then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : (d.agents || [])));
    fetch("/api/cohorts").then(r => r.json()).then(d => Array.isArray(d) && setCohorts(d));
  }, []);

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const res = await fetch(`/api/applications/${id}`);
        if (res.status === 401) {
          router.push("/admin");
          return;
        }
        if (!res.ok) throw new Error("申請の取得に失敗しました");
        const data: Application = await res.json();
        setApplication(data);
        setSelectedStatus(data.status);
        setAdminMemo(data.adminMemo || "");
        setSelectedAgentId(data.agentId || "");
        setSelectedCohortId(data.cohortId || "");
        setExamModeEdit(data.examMode || "一般");
        setReferrerNameEdit(data.referrerName || "");
        setReferrerTypeEdit(data.referrerType || "");
        setInterviewDate(data.interviewDate || "");
        setInterviewTime(data.interviewTime || "");
        setInterviewPlace(data.interviewPlace || "");
        setInterviewNotes(data.interviewNotes || "");
        if (data.enrollmentProcedure) {
          const ep = data.enrollmentProcedure;
          setEnrollInstructions(ep.instructions || "");
          setEnrollDeadline(ep.deadline || "");
          setEnrollPublished(!!ep.publishedAt);
          setEnrollStatus(ep.status);
          setEnrollStudentMemo(ep.studentMemo || "");
          setEnrollCompletedAt(ep.completedAt);
          setStep1Deadline(ep.step1Deadline || "");
          setStep2Deadline(ep.step2Deadline || "");
          setStep3Deadline(ep.step3Deadline || "");
          setTuitionPlan(ep.tuitionPlan || "全額");
          setTuitionPaid(ep.tuitionPaid || false);
          setTuitionAmount(ep.tuitionAmount || "");
          setTuitionAmount2(ep.tuitionAmount2 || "");
          setTuitionDeadline2(ep.tuitionDeadline2 || "");
          setTuitionBankInfo(ep.tuitionBankInfo || "");
          setDocSubmitted(ep.docSubmitted || false);
          if (ep.docChecklist) {
            try { setDocChecklist(JSON.parse(ep.docChecklist)); } catch {}
          }
          setVisaStatus(ep.visaStatus || "未申請");
          setVisaNote(ep.visaNote || "");
          setDormApply(ep.dormApply || false);
          setDormStatus(ep.dormStatus || "未申請");
          setDormNote(ep.dormNote || "");
          setEnrollAdminNote(ep.adminNote || "");
          setCeremonyDate(ep.ceremonyDate || "");
          setCeremonyPlace(ep.ceremonyPlace || "");
          setCeremonyNotes(ep.ceremonyNotes || "");
          setVisaGuideNotes(ep.visaGuideNotes || "");
        }
        // DOC_CHECKLISTをadminNotesから復元
        const checkNote = (data.adminNotes||[]).find((n:{content:string})=>n.content.startsWith("[DOC_CHECKLIST]"));
        if (checkNote) { try { setDocCheckState(JSON.parse(checkNote.content.replace("[DOC_CHECKLIST]",""))); } catch {} }
        // WRITTEN_EXAMをadminNotesから復元
        const examNote = (data.adminNotes||[]).find((n:{content:string})=>n.content.startsWith("[WRITTEN_EXAM]"));
        if (examNote) {
          try {
            const examData = JSON.parse(examNote.content.replace("[WRITTEN_EXAM]",""));
            setWrittenExamDate(examData.date || "");
            setWrittenExamScoreReading(examData.scoreReading != null ? String(examData.scoreReading) : "");
            setWrittenExamScoreGrammar(examData.scoreGrammar != null ? String(examData.scoreGrammar) : "");
            setWrittenExamScoreGeneral(examData.scoreGeneral != null ? String(examData.scoreGeneral) : "");
            setWrittenExamResult(examData.result || "採点中");
            setWrittenExamNotes(examData.notes || "");
          } catch {}
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラーが発生しました");
      } finally {
        setLoading(false);
      }
    };
    fetchApplication();
  }, [id, router]);

  const handleStatusUpdate = async () => {
    if (!application) return;
    setSaving(true);
    try {
      const needsResultEmail =
        (selectedStatus === "合格" || selectedStatus === "不合格" || selectedStatus === "補欠合格") && sendResultEmail;

      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedStatus }),
      });
      if (res.ok) {
        setApplication((prev) => prev ? { ...prev, status: selectedStatus } : null);
        setStatusSaved(true);
        setTimeout(() => setStatusSaved(false), 3000);
        // 操作ログ
        fetch(`/api/applications/${id}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:`[AUTO] ステータスを「${selectedStatus}」に変更しました`,isInternal:true})}).catch(()=>{});

        // 合否通知メール送信
        if (needsResultEmail) {
          const notifRes = await fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "result",
              to: application.email,
              applicantEmail: application.email,
              applicantName: `${application.lastName} ${application.firstName}`,
              applicationNo: application.applicationNo,
              resultStatus: selectedStatus as "合格" | "補欠合格" | "不合格",
            }),
          });
          if (notifRes.ok) {
            // resultEmailSent をマーク
            await fetch(`/api/applications/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resultEmailSent: true }),
            });
            setApplication((prev) => prev ? { ...prev, resultEmailSent: true } : null);
          }
        }
      }
    } finally {
      setSaving(false);
    }
  };

  // 志望校合否から全体statusを自動導出するロジック
  const deriveOverallStatus = (
    schools: ApplicationSchoolEntry[],
    newSchoolId: string,
    newResult: string
  ): string | null => {
    // 更新後の全志望校リスト
    const updated = schools.map(s =>
      s.id === newSchoolId ? { ...s, result: newResult || null } : s
    );
    const results = updated.map(s => s.result);

    // 1. いずれかが合格 → 合格（辞退より優先：他校辞退でも合格校に入学できる）
    if (results.some(r => r === "合格")) return "合格";
    // 2. 全校が辞退 → 辞退（全部断った＝入学しない意思）
    if (results.every(r => r === "辞退")) return "辞退";
    // 3. 合格なし・全校が不合格or辞退 → 不合格
    if (results.every(r => r === "不合格" || r === "辞退")) return "不合格";
    // 4. 全て保留 → 保留
    if (results.every(r => r === "保留")) return "保留";
    // 5. 未確定が含まれる → 変更しない
    return null;
  };

  const handleSchoolResultSave = async (schoolId: string, result: string) => {
    if (!application) return;
    setSchoolResultSaving(schoolId);
    try {
      // 志望校合否を更新
      const res = await fetch(`/api/applications/${id}/schools`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, result: result || null }),
      });
      if (!res.ok) throw new Error("更新失敗");

      // 全体statusの自動連動
      const newOverallStatus = deriveOverallStatus(
        application.applicationSchools, schoolId, result
      );

      // ローカルstate更新
      const updatedSchools = application.applicationSchools.map(s =>
        s.id === schoolId ? { ...s, result: result || null } : s
      );
      setApplication(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          applicationSchools: updatedSchools,
          status: newOverallStatus ?? prev.status,
        };
      });
      setSelectedStatus(newOverallStatus ?? application.status);

      // 全体statusをAPIで自動更新
      if (newOverallStatus && newOverallStatus !== application.status) {
        await fetch(`/api/applications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newOverallStatus }),
        });
      }

      setSchoolResultSaved(schoolId);
      setTimeout(() => setSchoolResultSaved(null), 2500);
    } catch {
      alert("更新に失敗しました");
    } finally {
      setSchoolResultSaving(null);
    }
  };

  const handleMemoSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminMemo }),
      });
      if (res.ok) {
        setMemoSaved(true);
        setTimeout(() => setMemoSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setNoteAdding(true);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addNote: newNote.trim() }),
      });
      if (res.ok) {
        const dataRes = await fetch(`/api/applications/${id}`);
        const data = await dataRes.json();
        setApplication(data);
        setNewNote("");
      }
    } finally {
      setNoteAdding(false);
    }
  };

  const handleExamModeSave = async () => {
    if (!application) return;
    setExamModeSaving(true);
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examMode: examModeEdit,
          referrerName: referrerNameEdit || null,
          referrerType: referrerTypeEdit || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setApplication(updated);
        setExamModeSaved(true);
        setTimeout(() => setExamModeSaved(false), 2000);
      }
    } finally {
      setExamModeSaving(false);
    }
  };

  const handleAgentSave = async () => {
    setAgentSaving(true);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      if (res.ok) {
        const agent = agents.find(a => a.id === selectedAgentId) || null;
        setApplication(prev => prev ? { ...prev, agentId: selectedAgentId || null, agent } : null);
        setAgentSaved(true);
        setTimeout(() => setAgentSaved(false), 3000);
      }
    } finally {
      setAgentSaving(false);
    }
  };

  const handleCohortSave = async () => {
    setCohortSaving(true);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohortId: selectedCohortId || null }),
      });
      if (res.ok) {
        const cohort = cohorts.find(c => c.id === selectedCohortId) || null;
        setApplication(prev => prev ? { ...prev, cohortId: selectedCohortId || null, cohort: cohort ? { id: cohort.id, name: cohort.name } : null } : null);
        setCohortSaved(true);
        setTimeout(() => setCohortSaved(false), 3000);
      }
    } finally {
      setCohortSaving(false);
    }
  };

  const handleInterviewSave = async () => {
    if (!application) return;
    setInterviewSaving(true);
    try {
      // Save interview fields
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewDate,
          interviewTime,
          interviewPlace,
          interviewNotes,
        }),
      });
      if (!res.ok) throw new Error("保存失敗");

      // Send notification email
      const notifRes = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "interview",
          to: application.email,
          applicantEmail: application.email,
          applicantName: `${application.lastName} ${application.firstName}`,
          applicationNo: application.applicationNo,
          interviewDate,
          interviewTime,
          interviewPlace,
          interviewNotes,
        }),
      });

      if (notifRes.ok) {
        // Mark email sent
        await fetch(`/api/applications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewEmailSent: true }),
        });
        setApplication((prev) =>
          prev
            ? {
                ...prev,
                interviewDate,
                interviewTime,
                interviewPlace,
                interviewNotes,
                interviewEmailSent: true,
              }
            : null
        );
        setInterviewSaved(true);
        setTimeout(() => setInterviewSaved(false), 5000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setInterviewSaving(false);
    }
  };

  const handleEnrollSave = async (publish: boolean) => {
    if (!application) return;
    setEnrollSaving(true);
    try {
      const res = await fetch("/api/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: application.id,
          instructions: enrollInstructions,
          deadline: enrollDeadline,
          publish,
          step1Deadline,
          step2Deadline,
          step3Deadline,
          tuitionPlan,
          tuitionPaid,
          tuitionAmount,
          tuitionAmount2,
          tuitionDeadline2,
          tuitionBankInfo,
          docSubmitted,
          docChecklist: JSON.stringify(docChecklist),
          visaStatus,
          visaNote,
          dormApply,
          dormStatus,
          dormNote,
          adminNote: enrollAdminNote,
        }),
      });
      if (!res.ok) throw new Error("保存失敗");
      const data = await res.json();
      setEnrollPublished(!!data.procedure.publishedAt);
      setEnrollStatus(data.procedure.status);

      if (publish) {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "enrollment",
            to: application.email,
            applicantEmail: application.email,
            applicantName: `${application.lastName} ${application.firstName}`,
            applicationNo: application.applicationNo,
            instructions: enrollInstructions,
            deadline: enrollDeadline,
          }),
        });
      }

      setEnrollSaved(true);
      setTimeout(() => setEnrollSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setEnrollSaving(false);
    }
  };

  const handleWrittenExamSave = async () => {
    setWrittenExamSaving(true);
    try {
      const examData = {
        date: writtenExamDate,
        scoreReading: writtenExamScoreReading !== "" ? Number(writtenExamScoreReading) : null,
        scoreGrammar: writtenExamScoreGrammar !== "" ? Number(writtenExamScoreGrammar) : null,
        scoreGeneral: writtenExamScoreGeneral !== "" ? Number(writtenExamScoreGeneral) : null,
        result: writtenExamResult,
        notes: writtenExamNotes,
      };
      const res = await fetch(`/api/applications/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "[WRITTEN_EXAM]" + JSON.stringify(examData), isInternal: true }),
      });
      if (res.ok) {
        // Reload notes to reflect the new/updated entry
        const dataRes = await fetch(`/api/applications/${id}`);
        const data = await dataRes.json();
        setApplication(data);
        setWrittenExamSaved(true);
        setTimeout(() => setWrittenExamSaved(false), 2500);
      }
    } finally {
      setWrittenExamSaving(false);
    }
  };

  const showSendResultEmail =
    (selectedStatus === "合格" || selectedStatus === "補欠合格" || selectedStatus === "不合格") &&
    selectedStatus !== application?.status;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin w-8 h-8 text-navy-600 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-500 mt-3">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "申請が見つかりません"}</p>
          <Link href="/admin/dashboard" className="btn-primary">
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-navy-300 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="font-bold text-lg">申請詳細</h1>
              <p className="text-navy-300 text-xs font-mono">{application.applicationNo}</p>
            </div>
          </div>
          <span className={`status-badge text-sm px-3 py-1 ${getStatusStyle(application.status)}`}>
            {application.status}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* タブナビゲーション */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl shadow-sm border border-gray-200 p-1 overflow-x-auto">
          {TABS.map(tab=>(
            <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab===tab.key?"bg-navy-700 text-white shadow":"text-gray-600 hover:bg-gray-100"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* 左カラム: 申請情報 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 申請者情報サマリー */}
            <div className="card bg-navy-800 text-white">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">
                    {application.lastName} {application.firstName}
                  </h2>
                  <p className="text-navy-300">
                    {application.lastNameKana} {application.firstNameKana}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-navy-300 text-xs">申請日</p>
                  <p className="text-sm">{formatDateTimeJP(application.createdAt)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-navy-700 rounded-lg p-3">
                  <p className="text-navy-300 text-xs mb-1">国籍</p>
                  <p className="font-medium">{application.nationality}</p>
                </div>
                <div className="bg-navy-700 rounded-lg p-3">
                  <p className="text-navy-300 text-xs mb-1">日本語レベル</p>
                  <span className={`status-badge ${getJapaneseLevelStyle(application.japaneseLevel)}`}>
                    {application.japaneseLevel}
                  </span>
                </div>
                <div className="bg-navy-700 rounded-lg p-3">
                  <p className="text-navy-300 text-xs mb-1">志望校</p>
                  <p className="font-medium text-sm">{application.schoolName}</p>
                </div>
                <div className="bg-navy-700 rounded-lg p-3">
                  <p className="text-navy-300 text-xs mb-1">入学希望</p>
                  <p className="font-medium">{application.enrollmentYear}年{application.enrollmentMonth}月</p>
                </div>
              </div>
            </div>

            {/* 個人情報 - 基本情報タブ */}
            <div style={{display: activeTab==="basic" ? undefined : "none"}}>
            <Section title="個人情報">
              <InfoRow label="生年月日" value={application.birthDate} />
              <InfoRow label="性別" value={application.gender} />
              <InfoRow label="国籍" value={application.nationality} />
              <InfoRow label="電話番号" value={application.phone} />
              <InfoRow label="メールアドレス" value={application.email} />
              <InfoRow
                label="住所"
                value={`〒${application.postalCode} ${application.prefecture}${application.city}${application.address}${application.addressDetail ? " " + application.addressDetail : ""}`}
              />
            </Section>

            <Section title="在日情報・日本語能力">
              <InfoRow label="在留資格" value={application.residenceStatus} />
              <InfoRow label="在留期限" value={application.residenceExpiry} />
              <InfoRow label="日本語レベル" value={application.japaneseLevel} />
              <InfoRow label="JLPT証明書" value={application.jlptCertified} />
            </Section>

            </div>{/* end basic tab */}

            {/* 選考区分・推薦 - 選考タブ */}
            <div style={{display: activeTab==="screening" ? undefined : "none"}}>
            <Section title="選考区分・推薦情報">
              <div className="space-y-3 py-1">
                {/* 選考区分 */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">選考区分</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      {value:"一般", label:"一般選考", sub:"✏️ 筆記あり"},
                      {value:"指定推薦", label:"◆ 指定推薦", sub:"🎫 筆記免除"},
                      {value:"特待生", label:"★ 特待生", sub:"🎫 筆記免除"},
                    ]).map((mode) => (
                      <label key={mode.value} className={`cursor-pointer rounded-lg border-2 p-2.5 text-center transition-colors ${examModeEdit === mode.value ? "border-navy-700 bg-navy-50" : "border-gray-200 hover:border-navy-300"}`}>
                        <input type="radio" name="examModeEdit" value={mode.value} className="hidden"
                          checked={examModeEdit === mode.value}
                          onChange={() => setExamModeEdit(mode.value)}
                        />
                        <span className={`text-xs font-bold block ${examModeEdit === mode.value ? "text-navy-800" : "text-gray-600"}`}>
                          {mode.label}
                        </span>
                        <span className={`text-xs mt-0.5 block ${mode.value === "一般" ? "text-orange-600" : "text-green-600"}`}>
                          {mode.sub}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 推薦機関 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">推薦・紹介機関名</p>
                    <input type="text" className="form-input text-sm py-1.5"
                      placeholder="機関名・紹介者名（任意）"
                      value={referrerNameEdit}
                      onChange={(e) => setReferrerNameEdit(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">機関種別</p>
                    <select className="form-input text-sm py-1.5"
                      value={referrerTypeEdit}
                      onChange={(e) => setReferrerTypeEdit(e.target.value)}
                    >
                      <option value="">種別なし</option>
                      <option value="エージェント">留学エージェント</option>
                      <option value="学校">学校・教育機関</option>
                      <option value="個人">個人（恩師・知人）</option>
                      <option value="その他">その他</option>
                    </select>
                  </div>
                </div>

                {/* 保存ボタン */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleExamModeSave}
                    disabled={examModeSaving}
                    className="px-4 py-1.5 bg-navy-700 text-white text-xs font-semibold rounded-lg hover:bg-navy-800 disabled:opacity-50 transition-colors"
                  >
                    {examModeSaving ? "保存中..." : "変更を保存"}
                  </button>
                  {examModeSaved && <span className="text-green-600 text-xs font-medium">✓ 保存しました</span>}
                </div>
              </div>
            </Section>

            </div>{/* end screening left */}

            {/* 志望校情報 - 志望校タブ */}
            <div style={{display: activeTab==="schools" ? undefined : "none"}}>
            <Section title="志望校情報">
              {(application.applicationSchools && application.applicationSchools.length > 0
                ? application.applicationSchools
                : [{ id: "legacy", priority: 1, schoolName: application.schoolName, department: application.department, course: application.course, enrollmentYear: application.enrollmentYear, enrollmentMonth: application.enrollmentMonth, result: null, memo: null }]
              ).map((s) => {
                const priorityLabel = ["第1志望", "第2志望", "第3志望"][s.priority - 1] || `第${s.priority}志望`;
                const resultColor: Record<string, string> = {
                  合格: "bg-green-100 text-green-700 border-green-200",
                  不合格: "bg-red-50 text-red-700 border-red-200",
                  保留: "bg-yellow-50 text-yellow-700 border-yellow-200",
                  辞退: "bg-gray-100 text-gray-600 border-gray-200",
                };
                const isLegacy = s.id === "legacy";
                return (
                  <div key={s.id} className={`py-3 border-b border-gray-100 last:border-0 ${s.result === "合格" ? "bg-green-50 -mx-4 px-4 rounded-lg" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.priority === 1 ? "bg-navy-800 text-white" : s.priority === 2 ? "bg-navy-200 text-navy-700" : "bg-gray-100 text-gray-600"}`}>
                            {priorityLabel}
                          </span>
                          {s.result && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${resultColor[s.result] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                              {s.result}
                            </span>
                          )}
                          {schoolResultSaved === s.id && (() => {
                            const derived = deriveOverallStatus(application.applicationSchools, s.id, s.result || "");
                            return (
                              <span className="text-xs text-green-600 font-medium">
                                ✓ 保存
                                {derived && <span className="ml-1 text-navy-600">→ 申請全体も「{derived}」に自動更新</span>}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="font-semibold text-gray-900">{s.schoolName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.department}{s.course ? ` › ${s.course}` : ""} ／ {s.enrollmentYear}年{s.enrollmentMonth}月入学</p>
                      </div>
                      {/* 合否設定 */}
                      {!isLegacy && (
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-navy-600 cursor-pointer"
                            value={s.result || ""}
                            disabled={schoolResultSaving === s.id}
                            onChange={(e) => handleSchoolResultSave(s.id, e.target.value)}
                          >
                            <option value="">未確定</option>
                            <option value="合格">合格</option>
                            <option value="不合格">不合格</option>
                            <option value="保留">保留</option>
                            <option value="辞退">辞退</option>
                          </select>
                          {schoolResultSaving === s.id && (
                            <svg className="animate-spin w-3.5 h-3.5 text-navy-600" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="py-2.5 text-sm mt-1">
                <p className="text-gray-500 font-medium mb-2">志望動機</p>
                <p className="text-gray-900 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                  {application.applicationReason}
                </p>
              </div>
            </Section>

            </div>{/* end schools tab */}

            {/* 選考費 - 選考タブ */}
            <div style={{display: activeTab==="screening" ? undefined : "none"}}>
            <Section title="選考費支払い状況">
              <div className="py-2">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">選考費金額</p>
                    <p className="text-2xl font-bold text-navy-800">
                      {application.examFeeAmount != null
                        ? `¥${application.examFeeAmount.toLocaleString()}`
                        : "未設定"}
                      {application.examFeeAmount === 40000 && (
                        <span className="text-xs font-normal text-gray-500 ml-2">（並願 2校）</span>
                      )}
                    </p>
                  </div>
                  {/* 支払い状態変更 */}
                  <div className="flex items-center gap-2">
                    <select
                      className={`text-sm border rounded-lg px-3 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-navy-500 cursor-pointer ${
                        application.examFeeStatus === "確認済み" ? "border-green-300 bg-green-50 text-green-700" :
                        application.examFeeStatus === "確認中" ? "border-yellow-300 bg-yellow-50 text-yellow-700" :
                        "border-red-200 bg-red-50 text-red-700"
                      }`}
                      value={application.examFeeStatus}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        const res = await fetch(`/api/applications/${id}/fee`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ examFeeStatus: newStatus }),
                        });
                        if (res.ok) {
                          setApplication(prev => prev ? { ...prev, examFeeStatus: newStatus } : prev);
                        }
                      }}
                    >
                      <option value="未払い">未払い</option>
                      <option value="確認中">確認中</option>
                      <option value="確認済み">確認済み</option>
                      <option value="免除">免除</option>
                    </select>
                  </div>
                </div>

                {/* 振込証明書 */}
                {application.examFeeReceiptUrl ? (
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-green-800">振込証明書あり</p>
                      <a href={application.examFeeReceiptUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-green-600 hover:underline">ファイルを開く →</a>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-center">
                    <p className="text-xs text-gray-400">振込証明書 未提出</p>
                  </div>
                )}

                {/* 金額を手動設定 */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">金額を変更：</span>
                  {[20000, 40000].map(amt => (
                    <button key={amt} onClick={async () => {
                      const res = await fetch(`/api/applications/${id}/fee`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ examFeeAmount: amt }),
                      });
                      if (res.ok) setApplication(prev => prev ? { ...prev, examFeeAmount: amt } : prev);
                    }}
                      className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${application.examFeeAmount === amt ? "bg-navy-800 text-white border-navy-800" : "border-gray-300 text-gray-600 hover:border-navy-400"}`}>
                      ¥{amt.toLocaleString()}（{amt === 20000 ? "1校" : "2校並願"}）
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            </div>{/* end screening fee */}

            {/* 筆記試験成績 - 選考タブ（一般選考のみ表示） */}
            <div style={{display: activeTab==="screening" ? undefined : "none"}}>
            <Section title={`✏️ 筆記試験成績${application.examMode !== "一般" ? "（推薦・特待生は筆記免除）" : ""}`}>
              {application.examMode !== "一般" ? (
                <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">🎫 この出願者は筆記試験免除の選考区分です。</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">日本語スコア（100点満点）</label>
                      <div className="flex items-center gap-3">
                        <input type="number" min="0" max="100" className="form-input text-2xl font-bold text-center w-28" placeholder="—" value={writtenExamScoreReading} onChange={e=>setWrittenExamScoreReading(e.target.value)} />
                        <span className="text-gray-400 text-sm">/ 100点</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">合否判定</label>
                      <div className="flex gap-2">
                        {["採点中","合格","不合格"].map(r=>(
                          <label key={r} className={`flex-1 cursor-pointer rounded-lg border-2 py-2 text-center text-xs font-bold transition-colors ${writtenExamResult===r ? r==="合格"?"border-green-500 bg-green-50 text-green-700":r==="不合格"?"border-red-500 bg-red-50 text-red-700":"border-navy-700 bg-navy-50 text-navy-800" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                            <input type="radio" className="hidden" checked={writtenExamResult===r} onChange={()=>setWrittenExamResult(r)} />
                            {r==="合格"?"✓ "+r:r==="不合格"?"✗ "+r:"⏳ "+r}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
                    <textarea className="form-input text-sm min-h-[60px] resize-y" placeholder="特記事項など（任意）" value={writtenExamNotes} onChange={e=>setWrittenExamNotes(e.target.value)} />
                  </div>
                  <button onClick={handleWrittenExamSave} disabled={writtenExamSaving} className="btn-primary text-sm">
                    {writtenExamSaving?"保存中…":writtenExamSaved?"✓ 保存しました":"成績を保存"}
                  </button>
                </div>
              )}
            </Section>
            </div>

            {/* 学歴 - 基本情報タブ */}
            <div style={{display: activeTab==="basic" ? undefined : "none"}}>
            <Section title="最終学歴・職歴">
              <InfoRow label="最終学歴（学校名）" value={application.lastSchoolName} />
              <InfoRow label="最終学歴（国）" value={application.lastSchoolCountry} />
              <InfoRow label="卒業状況" value={application.lastSchoolGraduate} />
              {application.workExperience && (
                <div className="py-2.5 text-sm">
                  <p className="text-gray-500 font-medium mb-2">職務経歴</p>
                  <p className="text-gray-900 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
                    {application.workExperience}
                  </p>
                </div>
              )}
            </Section>

            </div>{/* end basic education */}

            {/* 提出書類 + チェックリスト - 書類タブ */}
            <div style={{display: activeTab==="documents" ? undefined : "none"}}>
            <Section title={`提出書類（${application.documents.length}件）`}>
              {application.documents.length === 0 ? (
                <p className="text-gray-400 text-sm py-2">書類なし</p>
              ) : (
                <div className="space-y-2">
                  {application.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-navy-100 rounded-lg flex items-center justify-center">
                          {doc.mimeType === "application/pdf" ? (
                            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm text-gray-800">{doc.docType}</p>
                          <p className="text-xs text-gray-500">
                            {doc.originalName} · {formatFileSize(doc.fileSize)}
                          </p>
                          <p className="text-xs text-gray-400">{formatDateTimeJP(doc.uploadedAt)}</p>
                        </div>
                      </div>
                      <a
                        href={doc.filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-navy-700 hover:text-navy-900 text-sm font-medium bg-white border border-gray-300 hover:border-navy-400 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        ダウンロード
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 書類確認チェックリスト（事務用） */}
            <Section title="書類確認チェックリスト（事務確認用）">
              {(() => {
                const checked = DOC_CHECK_ITEMS.filter(i=>docCheckState[i]?.checked).length;
                const total = DOC_CHECK_ITEMS.length;
                return (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full transition-all" style={{width:`${(checked/total)*100}%`}}/>
                      </div>
                      <span className="text-sm text-gray-600 whitespace-nowrap">{checked}/{total} 確認済</span>
                      {checked===total && <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full border border-green-300">✓ 完了</span>}
                    </div>
                    <div className="space-y-1.5 mb-4">
                      {DOC_CHECK_ITEMS.map(item=>(
                        <label key={item} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" className="w-4 h-4 accent-navy-700"
                            checked={!!docCheckState[item]?.checked}
                            onChange={e=>setDocCheckState(prev=>({...prev,[item]:{checked:e.target.checked,checkedAt:e.target.checked?new Date().toISOString():undefined}}))}/>
                          <span className={`text-sm flex-1 ${docCheckState[item]?.checked?"line-through text-gray-400":"text-gray-800"}`}>{item}</span>
                          {docCheckState[item]?.checkedAt && <span className="text-xs text-gray-400">{new Date(docCheckState[item].checkedAt!).toLocaleDateString("ja-JP")}</span>}
                        </label>
                      ))}
                    </div>
                    <button onClick={saveDocCheck} disabled={docCheckSaving} className="btn-primary text-sm w-full">
                      {docCheckSaving?"保存中…":docCheckSaved?"✓ 保存しました":"チェック状態を保存"}
                    </button>
                  </div>
                );
              })()}
            </Section>
            </div>{/* end documents tab */}

          </div>

          {/* 右カラム: 管理パネル */}
          <div className="space-y-4">
            {/* 選考バッチ - 選考タブ */}
            <div style={{display: activeTab==="screening" ? undefined : "none"}}>
            <div className="card">
              <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-3">
                選考バッチ
              </h3>
              {application.cohort && (
                <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="text-xs text-indigo-600 font-medium mb-0.5">現在のバッチ</p>
                  <p className="text-sm font-bold text-indigo-900">{application.cohort.name}</p>
                </div>
              )}
              <select
                className="form-input text-sm mb-3"
                value={selectedCohortId}
                onChange={(e) => setSelectedCohortId(e.target.value)}
              >
                <option value="">— バッチ未設定 —</option>
                {cohorts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={handleCohortSave}
                disabled={cohortSaving}
                className="btn-primary w-full text-sm"
              >
                {cohortSaved ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    保存しました
                  </span>
                ) : cohortSaving ? "保存中..." : "バッチを設定"}
              </button>
            </div>
            </div>{/* end cohort screening-tab */}

            {/* エージェント - 選考タブ */}
            <div style={{display: activeTab==="screening" ? undefined : "none"}}>
            <div className="card">
              <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-3">
                紹介エージェント
              </h3>
              {application.agent && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium mb-0.5">現在の担当</p>
                  <p className="text-sm font-bold text-blue-900">{application.agent.name}</p>
                  {application.agent.country && (
                    <p className="text-xs text-blue-600">{application.agent.country}</p>
                  )}
                  {application.agent.contactName && (
                    <p className="text-xs text-blue-500">担当：{application.agent.contactName}</p>
                  )}
                </div>
              )}
              <select
                className="form-input text-sm mb-3"
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
              >
                <option value="">— エージェントなし —</option>
                {agents.filter(a => a.isActive).map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.country ? `（${a.country}）` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAgentSave}
                disabled={agentSaving}
                className="btn-primary w-full text-sm"
              >
                {agentSaved ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    保存しました
                  </span>
                ) : agentSaving ? "保存中..." : "エージェントを設定"}
              </button>
              {agents.length === 0 && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  <a href="/admin/agents" className="text-navy-600 underline">エージェントを登録する →</a>
                </p>
              )}
            </div>
            </div>{/* end agent screening-tab */}

            {/* 状態管理 - 選考タブ */}
            <div style={{display: activeTab==="screening" ? undefined : "none"}}>
            <div className="card">
              <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-4">
                審査状態の変更
              </h3>
              <div className="space-y-2 mb-4">
                {STATUSES.map((s) => (
                  <label
                    key={s}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border transition-all ${
                      selectedStatus === s
                        ? "border-navy-600 bg-navy-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={s}
                      checked={selectedStatus === s}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="text-navy-800"
                    />
                    <span className={`status-badge ${getStatusStyle(s)}`}>{s}</span>
                  </label>
                ))}
              </div>

              {/* 合否メール送信オプション */}
              {showSendResultEmail && (
                <label className="flex items-center gap-2 mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendResultEmail}
                    onChange={(e) => setSendResultEmail(e.target.checked)}
                    className="rounded text-navy-800"
                  />
                  <span className="text-sm text-blue-800 font-medium">通知メールも送信する</span>
                </label>
              )}
              {application.resultEmailSent && (
                <p className="text-xs text-green-600 mb-3 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  合否通知メール送信済み
                </p>
              )}

              <button
                onClick={handleStatusUpdate}
                disabled={saving || selectedStatus === application.status}
                className="btn-primary w-full"
              >
                {statusSaved ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    保存しました
                  </span>
                ) : (
                  "状態を更新する"
                )}
              </button>
            </div>

            {/* 面接設定 */}
            <div className="card">
              <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-4">
                面接設定
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">日付</label>
                  <input
                    type="date"
                    className="form-input text-sm"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">時間</label>
                  <input
                    type="time"
                    className="form-input text-sm"
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">場所</label>
                  <input
                    type="text"
                    className="form-input text-sm"
                    placeholder="例：本館3F 面接室A"
                    value={interviewPlace}
                    onChange={(e) => setInterviewPlace(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">注意事項</label>
                  <textarea
                    className="form-input text-sm min-h-[80px] resize-y"
                    placeholder="持ち物・注意事項など"
                    value={interviewNotes}
                    onChange={(e) => setInterviewNotes(e.target.value)}
                  />
                </div>
              </div>
              {application.interviewEmailSent && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  送信済み
                </p>
              )}
              <button
                onClick={handleInterviewSave}
                disabled={interviewSaving || application.interviewEmailSent}
                className={`btn-primary w-full mt-3 text-sm ${application.interviewEmailSent ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {interviewSaving ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    送信中...
                  </span>
                ) : interviewSaved ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    保存・送信しました
                  </span>
                ) : application.interviewEmailSent ? (
                  "送信済み"
                ) : (
                  "保存して通知メールを送信"
                )}
              </button>
            </div>

            {/* 面接フィードバック */}
            {(application.status === "面接待ち" || application.status === "合格" || application.status === "補欠合格" || application.status === "不合格" || application.status === "保留") && (
              <InterviewFeedbackCard applicationId={application.id} />
            )}
            </div>{/* end screening right tab */}



        {/* 入学手続き管理（合格後のみ・入学手続きタブ） */}
            <div style={{display: activeTab==="enrollment" ? undefined : "none"}}>
            {(application.status === "合格" || application.status === "補欠合格") && (
              <div className="card">
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide">
                    入学手続き管理
                  </h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    enrollStatus === "完了" ? "bg-green-100 text-green-700" :
                    enrollPublished ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {enrollStatus}
                  </span>
                </div>

                {/* 電子署名確認 */}
                {application.enrollmentSignature ? (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs font-bold text-green-800 mb-2">✍️ 電子署名済み</p>
                    <p className="text-xs text-green-700 mb-1">
                      署名者：<strong>{application.enrollmentSignature.signerName}</strong>
                    </p>
                    <p className="text-xs text-green-600 mb-2">
                      署名日時：{formatDateTimeJP(application.enrollmentSignature.signedAt)}
                    </p>
                    <div className="border border-green-300 rounded-lg overflow-hidden bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={application.enrollmentSignature.signatureData}
                        alt="電子署名"
                        className="w-full h-auto max-h-24 object-contain p-1"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-500">✍️ 電子署名：未署名</p>
                  </div>
                )}

                {/* 入学手続き提出書類 */}
                {(() => {
                  const enrollDocs = application.documents.filter(d => d.docType.startsWith("入学手続き_"));
                  return enrollDocs.length > 0 ? (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-bold text-blue-800 mb-2">📁 入学手続き提出書類（{enrollDocs.length}件）</p>
                      <div className="space-y-1.5">
                        {enrollDocs.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between bg-white rounded-lg px-2 py-1.5">
                            <div>
                              <p className="text-xs font-medium text-gray-700">{doc.docType.replace("入学手続き_", "")}</p>
                              <p className="text-xs text-gray-400">{doc.originalName}</p>
                            </div>
                            <a
                              href={doc.filePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-navy-600 hover:text-navy-800 font-medium border border-navy-200 px-2 py-1 rounded"
                            >
                              開く
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs text-gray-500">📁 入学手続き書類：未提出</p>
                    </div>
                  );
                })()}

                {/* 学生からのメモ */}
                {enrollStudentMemo && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-bold text-amber-800 mb-1">📩 学生からの報告</p>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap">{enrollStudentMemo}</p>
                    {enrollCompletedAt && (
                      <p className="text-xs text-amber-600 mt-1">完了報告日：{formatDateTimeJP(enrollCompletedAt)}</p>
                    )}
                  </div>
                )}

                <div className="space-y-4">

                  {/* STEP 1: 学費納入 */}
                  <div className="p-3 rounded-xl border-2 border-blue-200 bg-blue-50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-blue-800">STEP 1 · 💴 学費納入</p>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={tuitionPaid} onChange={(e) => setTuitionPaid(e.target.checked)} className="rounded text-green-600" />
                        <span className={`text-xs font-medium ${tuitionPaid ? "text-green-600" : "text-gray-400"}`}>{tuitionPaid ? "✅ 納入確認済み" : "未確認"}</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-blue-700 mb-1 font-medium">支払いプラン</label>
                        <select className="form-input text-xs" value={tuitionPlan} onChange={(e) => setTuitionPlan(e.target.value)}>
                          <option value="全額">全額一括</option>
                          <option value="分割（2期）">分割（2期）</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-blue-700 mb-1 font-medium">締切日 <span className="text-red-400">*</span></label>
                        <input type="date" className="form-input text-xs" value={step1Deadline} onChange={(e) => setStep1Deadline(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-blue-700 mb-1">{tuitionPlan === "分割（2期）" ? "第1期金額" : "金額"}</label>
                        <input type="text" className="form-input text-xs" placeholder="例：350,000円" value={tuitionAmount} onChange={(e) => setTuitionAmount(e.target.value)} />
                      </div>
                      {tuitionPlan === "分割（2期）" && (
                        <div>
                          <label className="block text-xs text-blue-700 mb-1">第2期金額</label>
                          <input type="text" className="form-input text-xs" placeholder="例：200,000円" value={tuitionAmount2} onChange={(e) => setTuitionAmount2(e.target.value)} />
                        </div>
                      )}
                    </div>
                    {tuitionPlan === "分割（2期）" && (
                      <div className="mb-2">
                        <label className="block text-xs text-blue-700 mb-1">第2期締切日</label>
                        <input type="date" className="form-input text-xs" value={tuitionDeadline2} onChange={(e) => setTuitionDeadline2(e.target.value)} />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-blue-700 mb-1">振込先情報（学生に表示）</label>
                      <textarea className="form-input text-xs min-h-[70px] resize-y" placeholder={"銀行名：〇〇銀行 〇〇支店\n口座種別：普通\n口座番号：1234567\n口座名義：〇〇学校法人"} value={tuitionBankInfo} onChange={(e) => setTuitionBankInfo(e.target.value)} />
                    </div>
                  </div>

                  {/* STEP 2: 書類提出 */}
                  <div className="p-3 rounded-xl border-2 border-purple-200 bg-purple-50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-purple-800">STEP 2 · 📋 書類提出</p>
                      <span className="text-xs text-purple-600">{docChecklist.filter(d => d.done).length}/{docChecklist.length} 確認済</span>
                    </div>
                    <div className="mb-2">
                      <label className="block text-xs text-purple-700 mb-1 font-medium">締切日 <span className="text-red-400">*</span></label>
                      <input type="date" className="form-input text-xs" value={step2Deadline} onChange={(e) => setStep2Deadline(e.target.value)} />
                    </div>
                    <div className="space-y-1.5 mb-2">
                      {docChecklist.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="checkbox" checked={item.done} onChange={(e) => { const u = [...docChecklist]; u[i] = { ...item, done: e.target.checked }; setDocChecklist(u); }} className="rounded text-green-600 shrink-0" />
                          <span className={`text-xs flex-1 ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>{item.name}</span>
                          {item.required && <span className="text-xs text-red-400 shrink-0">必須</span>}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setDocChecklist([...docChecklist, { name: "", required: false, done: false }])} className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>書類を追加
                    </button>
                    {docChecklist.map((item, i) =>
                      item.name === "" ? (
                        <input key={`new-${i}`} type="text" className="form-input text-xs mt-1" placeholder="書類名を入力..." autoFocus
                          onBlur={(e) => { const u = [...docChecklist]; if (e.target.value.trim()) { u[i] = { ...item, name: e.target.value.trim() }; } else { u.splice(i, 1); } setDocChecklist(u); }} />
                      ) : null
                    )}
                  </div>

                  {/* STEP 3: 電子署名 */}
                  <div className="p-3 rounded-xl border-2 border-green-200 bg-green-50">
                    <p className="text-xs font-bold text-green-800 mb-2">STEP 3 · ✍️ 入学誓約書への電子署名</p>
                    <div>
                      <label className="block text-xs text-green-700 mb-1 font-medium">締切日 <span className="text-red-400">*</span></label>
                      <input type="date" className="form-input text-xs" value={step3Deadline} onChange={(e) => setStep3Deadline(e.target.value)} />
                    </div>
                  </div>

                  {/* その他（ビザ・寮） */}
                  <div className="p-3 rounded-xl border border-gray-200 bg-gray-50">
                    <p className="text-xs font-bold text-gray-700 mb-3">🛂 その他管理情報</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">ビザ・在留資格</label>
                        <select className="form-input text-xs" value={visaStatus} onChange={(e) => setVisaStatus(e.target.value)}>
                          <option value="未申請">未申請</option>
                          <option value="申請中">申請中</option>
                          <option value="取得済">取得済</option>
                          <option value="不要">不要（在日者）</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">寮申請</label>
                        <select className="form-input text-xs" value={dormStatus} onChange={(e) => setDormStatus(e.target.value)}>
                          <option value="未申請">未申請</option>
                          <option value="申請済">申請済</option>
                          <option value="確定">確定</option>
                          <option value="キャンセル">キャンセル</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 学生への案内文 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">学生への追加案内文（任意）</label>
                    <textarea className="form-input text-xs min-h-[80px] resize-y" placeholder="振込の注意事項・持ち物など追加情報があれば記入してください" value={enrollInstructions} onChange={(e) => setEnrollInstructions(e.target.value)} />
                  </div>

                  {/* 内部メモ */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">内部メモ（学生には非表示）</label>
                    <textarea className="form-input text-xs min-h-[50px] resize-y" placeholder="担当者間の引継ぎメモなど" value={enrollAdminNote} onChange={(e) => setEnrollAdminNote(e.target.value)} />
                  </div>
                </div>

                {/* 保存ボタン */}
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleEnrollSave(false)}
                    disabled={enrollSaving}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    保存（非公開）
                  </button>
                  <button
                    onClick={() => handleEnrollSave(true)}
                    disabled={enrollSaving}
                    className="flex-1 btn-primary text-xs"
                  >
                    {enrollSaving ? "処理中..." : enrollSaved ? (
                      <span className="flex items-center justify-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        保存済み
                      </span>
                    ) : "保存して学生に公開"}
                  </button>
                </div>
              </div>
            )}

            {/* 学校承認・入学許可書・入学式・ビザ案内 */}
            {(application.status === "合格" || application.status === "補欠合格") &&
              application.enrollmentProcedure?.status === "完了" && (
              <div className="card border-l-4 border-emerald-500">
                <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wide mb-4">
                  🏫 入学後フロー管理
                </h3>

                {/* STEP A: 学校承認 → 入学許可書発行 */}
                <div className={`p-3 rounded-xl border-2 mb-3 ${application.enrollmentProcedure.schoolConfirmed ? "border-green-300 bg-green-50" : "border-emerald-300 bg-emerald-50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-emerald-800">① 学校承認 → 入学許可書発行</p>
                    {application.enrollmentProcedure.schoolConfirmed && (
                      <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">✓ 発行済み</span>
                    )}
                  </div>
                  {application.enrollmentProcedure.schoolConfirmed ? (
                    <p className="text-xs text-green-700">
                      承認日時：{application.enrollmentProcedure.schoolConfirmedAt
                        ? new Date(application.enrollmentProcedure.schoolConfirmedAt).toLocaleString("ja-JP")
                        : "—"}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-emerald-700 mb-2">学生の手続き書類を確認後、入学許可書を発行します。</p>
                      <button
                        onClick={async () => {
                          setConfirmSaving(true);
                          try {
                            const res = await fetch("/api/enrollment/confirm", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                applicationId: application.id,
                                action: "confirm",
                              }),
                            });
                            if (res.ok) {
                              window.location.reload();
                            }
                          } finally {
                            setConfirmSaving(false);
                          }
                        }}
                        disabled={confirmSaving}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {confirmSaving ? "処理中..." : "✅ 学校承認・入学許可書を発行する"}
                      </button>
                    </>
                  )}
                </div>

                {/* STEP B: 入学式通知 */}
                {application.enrollmentProcedure.schoolConfirmed && (
                  <div className={`p-3 rounded-xl border-2 mb-3 ${application.enrollmentProcedure.ceremonyNotified ? "border-green-300 bg-green-50" : "border-blue-300 bg-blue-50"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-blue-800">② 入学式のご案内</p>
                      {application.enrollmentProcedure.ceremonyNotified && (
                        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">✓ 通知済み</span>
                      )}
                    </div>
                    {!application.enrollmentProcedure.ceremonyNotified && (
                      <>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="block text-xs text-blue-700 mb-1">入学式日付</label>
                            <input type="date" className="form-input text-xs" value={ceremonyDate} onChange={(e) => setCeremonyDate(e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs text-blue-700 mb-1">会場</label>
                            <input type="text" className="form-input text-xs" placeholder="〇〇ホール" value={ceremonyPlace} onChange={(e) => setCeremonyPlace(e.target.value)} />
                          </div>
                        </div>
                        <textarea className="form-input text-xs min-h-[50px] resize-y mb-2" placeholder="持ち物・服装・集合時間など" value={ceremonyNotes} onChange={(e) => setCeremonyNotes(e.target.value)} />
                        <button
                          onClick={async () => {
                            setConfirmSaving(true);
                            try {
                              const res = await fetch("/api/enrollment/confirm", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ applicationId: application.id, action: "notify_ceremony", ceremonyDate, ceremonyPlace, ceremonyNotes }),
                              });
                              if (res.ok) window.location.reload();
                            } finally { setConfirmSaving(false); }
                          }}
                          disabled={confirmSaving || !ceremonyDate}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {confirmSaving ? "処理中..." : "🎌 入学式案内を通知する"}
                        </button>
                      </>
                    )}
                    {application.enrollmentProcedure.ceremonyNotified && application.enrollmentProcedure.ceremonyDate && (
                      <p className="text-xs text-green-700">日程：{application.enrollmentProcedure.ceremonyDate}　{application.enrollmentProcedure.ceremonyPlace || ""}</p>
                    )}
                  </div>
                )}

                {/* STEP C: ビザ更新案内 */}
                {application.enrollmentProcedure.schoolConfirmed && (
                  <div className={`p-3 rounded-xl border-2 ${application.enrollmentProcedure.visaGuideNotified ? "border-green-300 bg-green-50" : "border-purple-300 bg-purple-50"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-purple-800">③ ビザ更新手続き案内</p>
                      {application.enrollmentProcedure.visaGuideNotified && (
                        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">✓ 通知済み</span>
                      )}
                    </div>
                    {!application.enrollmentProcedure.visaGuideNotified && (
                      <>
                        <textarea className="form-input text-xs min-h-[60px] resize-y mb-2" placeholder="在留資格更新・COE申請の案内内容" value={visaGuideNotes} onChange={(e) => setVisaGuideNotes(e.target.value)} />
                        <button
                          onClick={async () => {
                            setConfirmSaving(true);
                            try {
                              const res = await fetch("/api/enrollment/confirm", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ applicationId: application.id, action: "notify_visa", visaGuideNotes }),
                              });
                              if (res.ok) window.location.reload();
                            } finally { setConfirmSaving(false); }
                          }}
                          disabled={confirmSaving}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {confirmSaving ? "処理中..." : "🛂 ビザ更新案内を通知する"}
                        </button>
                      </>
                    )}
                    {application.enrollmentProcedure.visaGuideNotified && (
                      <p className="text-xs text-green-700">{application.enrollmentProcedure.visaGuideNotes || "案内済み"}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>{/* end enrollment tab */}

            {/* 管理メモ・メモ履歴 - 常時表示 */}
            <div className="card">
              <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-3">
                管理メモ
              </h3>
              <textarea
                className="form-input min-h-[120px] resize-y text-sm mb-3"
                placeholder="この申請に関する内部メモを記入してください（申請者には表示されません）"
                value={adminMemo}
                onChange={(e) => setAdminMemo(e.target.value)}
              />
              <button
                onClick={handleMemoSave}
                disabled={saving}
                className="btn-primary w-full text-sm"
              >
                {memoSaved ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    保存しました
                  </span>
                ) : (
                  "メモを保存"
                )}
              </button>
            </div>

            {/* メモ履歴 */}
            <div className="card">
              <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-3">
                コメント・メモ履歴
              </h3>
              <div className="mb-3 space-y-2">
                <textarea
                  className="form-input text-sm min-h-[80px] resize-y"
                  placeholder="コメントを追加..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <button
                  onClick={handleAddNote}
                  disabled={noteAdding || !newNote.trim()}
                  className="btn-primary w-full text-sm"
                >
                  {noteAdding ? "追加中..." : "コメントを追加"}
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {application.adminNotes.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">
                    コメントはまだありません
                  </p>
                ) : (
                  application.adminNotes.map((note) => (
                    <div key={note.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-navy-700">{note.author}</span>
                        <span className="text-xs text-gray-400">{formatDateTimeJP(note.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 申請情報サマリー */}
            <div className="card bg-gray-50">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">
                申請情報
              </h3>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>申請番号</span>
                  <span className="font-mono font-bold">{application.applicationNo}</span>
                </div>
                <div className="flex justify-between">
                  <span>申請日時</span>
                  <span>{formatDateTimeJP(application.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>最終更新</span>
                  <span>{formatDateTimeJP(application.updatedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>書類数</span>
                  <span>{application.documents.length}件</span>
                </div>
              </div>
            </div>
          </div>


        </div>
      </main>
    </div>
  );
}
