"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { getStatusStyle } from "@/lib/utils";
import { useUI } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/Icon";

interface EnrollmentProcedure {
  instructions: string | null;
  deadline: string | null;
  status: string;
  completedAt: string | null;
  studentMemo: string | null;
  publishedAt: string | null;
  docChecklist: string | null;
  step1Deadline: string | null;
  step2Deadline: string | null;
  step3Deadline: string | null;
  tuitionPlan: string;
  tuitionAmount: string | null;
  tuitionAmount2: string | null;
  tuitionDeadline2: string | null;
  tuitionBankInfo: string | null;
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
  signedAt: string;
  signerName: string;
}

interface ApplicationStatus {
  id: string;
  applicationNo: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastName: string;
  firstName: string;
  schoolName: string;
  department: string;
  enrollmentYear: string;
  enrollmentMonth: string;
  documents: {
    id: string;
    docType: string;
    fileName: string;
    originalName: string;
    uploadedAt: string;
    status?: string;
    rejectReason?: string | null;
    reviewedAt?: string | null;
  }[];
  interviewDate: string | null;
  interviewTime: string | null;
  interviewPlace: string | null;
  interviewNotes: string | null;
  enrollmentProcedure: EnrollmentProcedure | null;
  enrollmentSignature: EnrollmentSignature | null;
  resultPublishedAt?: string | null;
  resultEmbargoed?: boolean;
  email: string;
  /** 管理者から学生に公開されたコメント */
  adminNotes?: {
    id: string;
    content: string;
    author: string;
    createdAt: string;
  }[];
  /** 併願（第1〜第3志望）。各校に独立した試験日程・合否を持つ。 */
  applicationSchools?: {
    id: string;
    priority: number;
    schoolName: string;
    department: string;
    course?: string | null;
    enrollmentYear: string;
    enrollmentMonth: string;
    result?: string | null;
    interviewDate?: string | null;
    interviewTime?: string | null;
    interviewPlace?: string | null;
    interviewNotes?: string | null;
    writtenExamDate?: string | null;
    writtenExamTime?: string | null;
    writtenExamPlace?: string | null;
    writtenExamNotes?: string | null;
    writtenExamExempted?: boolean;
  }[];
}

interface ChangeRequest {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string;
  reason: string | null;
  status: string; // 申請中 / 承認 / 却下
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface ChangeRequestFieldDef {
  key: string;
  label: string;
  type: "text" | "date" | "tel" | "email" | "select";
  options?: string[];
}

const PROGRESS_STEPS = [
  { key: "受付中", label: "受付中" },
  { key: "書類確認中", label: "書類確認中" },
  { key: "面接待ち", label: "面接待ち" },
  { key: "合格", label: "合格" },
  { key: "入学手続き", label: "入学手続き" },
  { key: "完了", label: "完了" },
];

function getProgressIndex(status: string, enrollmentStatus?: string): number {
  if (status === "合格" || status === "補欠合格") {
    if (!enrollmentStatus || enrollmentStatus === "未開始") return 3;
    if (enrollmentStatus === "完了") return 5;
    return 4;
  }
  const map: Record<string, number> = {
    書類待ち: 0,
    受付中: 0,
    書類確認中: 1,
    面接待ち: 2,
    合格: 3,
    補欠合格: 3,
    不合格: -1,
    保留: -1,
  };
  return map[status] ?? 0;
}

// 手書き署名コンポーネント
function SignatureCanvas({
  onSave,
  disabled,
}: {
  onSave: (dataUrl: string) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * (canvas.width / rect.width),
        y: (touch.clientY - rect.top) * (canvas.height / rect.height),
      };
    }
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      setHasDrawn(true);
    }
    lastPos.current = pos;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div>
      <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 overflow-hidden" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full cursor-crosshair"
          style={{ display: "block", touchAction: "none" }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1 mb-3">↑ このエリアに署名してください（マウスまたはタッチ）</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          クリア
        </button>
        <button
          type="button"
          onClick={save}
          disabled={disabled || !hasDrawn}
          className="flex-1 btn-primary text-sm disabled:opacity-50"
        >
          署名を確定する
        </button>
      </div>
    </div>
  );
}

// ===== 在籍情報コンポーネント =====
interface TimetableSlot { dayOfWeek: number; period: number; startTime: string; endTime: string; room: string | null; subject: { name: string }; teacher: { name: string } | null; }
interface PortalData {
  enrolled: boolean;
  student?: { studentNo: string; lastName: string; firstName: string; status: string; enrolledAt: string; school: { name: string }; class: { name: string; course: { name: string } } | null; };
  timetable?: TimetableSlot[];
  attendanceRate?: number | null;
  attendanceSummary?: { total: number; present: number; late: number; absent: number; publicLeave: number };
  recentAttendances?: { date: string; status: string; subject: { name: string } }[];
  leaveRequests?: { id: string; type: string; startDate: string; endDate: string; reason: string; status: string }[];
  certRequests?: { id: string; type: string; copies: number; status: string; createdAt: string }[];
}

const DAY_LABELS = ["", "月", "火", "水", "木", "金", "土"];
const CERT_TYPES = ["在籍証明書", "出席率証明書", "成績証明書", "卒業見込証明書"];
const ATT_COLORS: Record<string, string> = {
  出席: "bg-green-100 text-green-700", 欠席: "bg-red-100 text-red-700",
  遅刻: "bg-yellow-100 text-yellow-700", 早退: "bg-orange-100 text-orange-700", 公欠: "bg-blue-100 text-blue-700",
};

function StudentPortalSection({ applicationNo, email }: { applicationNo: string; email: string }) {
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [tab, setTab] = useState<"attendance" | "timetable" | "leave" | "cert">("attendance");
  const [loading, setLoading] = useState(true);
  const [leaveForm, setLeaveForm] = useState(false);
  const [certForm, setCertForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 欠席届フォーム
  const [leaveType, setLeaveType] = useState("欠席届");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  // 証明書申請フォーム
  const [certType, setCertType] = useState("在籍証明書");
  const [certPurpose, setCertPurpose] = useState("");
  const [certCopies, setCertCopies] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams({ applicationNo, email });
    fetch(`/api/student-portal?${params}`)
      .then(r => r.json())
      .then(d => { setPortalData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [applicationNo, email]);

  const handleLeaveSubmit = async () => {
    if (!leaveStart || !leaveEnd || !leaveReason) { setMsg("全項目を入力してください"); return; }
    setSubmitting(true);
    const res = await fetch("/api/student-portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationNo, email, action: "leave_request", type: leaveType, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason }),
    });
    const d = await res.json();
    if (d.success) {
      setMsg("欠席届を提出しました"); setLeaveForm(false); setLeaveStart(""); setLeaveEnd(""); setLeaveReason("");
      // 再取得
      const p = new URLSearchParams({ applicationNo, email });
      fetch(`/api/student-portal?${p}`).then(r => r.json()).then(d => setPortalData(d));
    } else { setMsg(d.error || "提出に失敗しました"); }
    setSubmitting(false);
  };

  const handleCertSubmit = async () => {
    setSubmitting(true);
    const res = await fetch("/api/student-portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationNo, email, action: "cert_request", type: certType, purpose: certPurpose, copies: certCopies }),
    });
    const d = await res.json();
    if (d.success) {
      setMsg("証明書申請を受け付けました"); setCertForm(false);
      const p = new URLSearchParams({ applicationNo, email });
      fetch(`/api/student-portal?${p}`).then(r => r.json()).then(d => setPortalData(d));
    } else { setMsg(d.error || "申請に失敗しました"); }
    setSubmitting(false);
  };

  if (loading) return <div className="text-center py-6 text-gray-400 text-sm">読み込み中...</div>;
  if (!portalData?.enrolled) return (
    <div className="text-center py-8 text-gray-400">
      <svg className="w-9 h-9 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M22 10 12 5 2 10l10 5 10-5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 12v5c3 1.5 9 1.5 12 0v-5" /></svg>
      <p className="text-sm">在籍登録が完了すると、出席・時間割・証明書などが確認できます</p>
    </div>
  );

  const s = portalData.student!;
  const rate = portalData.attendanceRate;

  return (
    <div>
      {/* 学籍情報ヘッダー */}
      <div className="bg-navy-800 text-white rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">{s.lastName} {s.firstName}</p>
            <p className="text-navy-300 text-sm">{s.school.name} · {s.class?.course?.name || ""} · {s.class?.name || ""}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm text-navy-300">{s.studentNo}</p>
            <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">{s.status}</span>
          </div>
        </div>
      </div>

      {/* 出席率サマリー */}
      {rate !== null && rate !== undefined && (
        <div className="grid grid-cols-5 gap-2 mb-4">
          <div className={`col-span-1 rounded-xl p-3 text-center ${rate >= 80 ? "bg-green-50" : rate >= 70 ? "bg-yellow-50" : "bg-red-50"}`}>
            <p className={`text-2xl font-bold ${rate >= 80 ? "text-green-700" : rate >= 70 ? "text-yellow-700" : "text-red-700"}`}>{rate}%</p>
            <p className="text-xs text-gray-500 mt-0.5">出席率</p>
          </div>
          {[
            { label: "出席", val: portalData.attendanceSummary?.present, color: "text-green-700" },
            { label: "欠席", val: portalData.attendanceSummary?.absent, color: "text-red-700" },
            { label: "遅刻", val: portalData.attendanceSummary?.late, color: "text-yellow-700" },
            { label: "公欠", val: portalData.attendanceSummary?.publicLeave, color: "text-blue-700" },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${color}`}>{val ?? 0}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{msg}</div>}

      {/* タブ */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {[
          { key: "attendance", label: "出席", icon: "M8 2v3M16 2v3M3.5 9h17M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
          { key: "timetable", label: "時間割", icon: "M4 5h16v14H4zM4 9h16M9 5v14" },
          { key: "leave", label: "欠席届", icon: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h4" },
          { key: "cert", label: "証明書", icon: "M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2zM8 8h8M8 12h6" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-colors ${tab === t.key ? "bg-white shadow text-navy-800" : "text-gray-500"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={t.icon} /></svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* 出席履歴 */}
      {tab === "attendance" && (
        <div className="space-y-1.5">
          {(portalData.recentAttendances || []).length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">出席記録がありません</p>
          ) : (portalData.recentAttendances || []).map((a, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 shrink-0">{a.date}</span>
                <span className="text-xs text-gray-700">{a.subject.name}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ATT_COLORS[a.status] || "bg-gray-100 text-gray-600"}`}>{a.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* 時間割 */}
      {tab === "timetable" && (
        <div>
          {(!portalData.timetable || portalData.timetable.length === 0) ? (
            <p className="text-center text-gray-400 text-sm py-6">時間割が登録されていません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-navy-800 text-white">
                    <th className="px-2 py-2 text-center w-8">時限</th>
                    {[1,2,3,4,5].map(d => <th key={d} className="px-3 py-2 text-center">{DAY_LABELS[d]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[1,2,3,4,5,6].map(period => (
                    <tr key={period} className={period % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                      <td className="px-2 py-3 text-center font-bold text-gray-500 border border-gray-100">{period}</td>
                      {[1,2,3,4,5].map(day => {
                        const slot = portalData.timetable?.find(s => s.dayOfWeek === day && s.period === period);
                        return (
                          <td key={day} className="px-2 py-2 text-center border border-gray-100 min-w-20">
                            {slot ? (
                              <div>
                                <p className="font-semibold text-navy-800 text-xs">{slot.subject.name}</p>
                                {slot.teacher && <p className="text-gray-400 text-xs">{slot.teacher.name}</p>}
                                {slot.room && <p className="text-gray-400 text-xs">{slot.room}</p>}
                                <p className="text-gray-300 text-xs">{slot.startTime}〜{slot.endTime}</p>
                              </div>
                            ) : <span className="text-gray-200">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 欠席届 */}
      {tab === "leave" && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setLeaveForm(!leaveForm)} className="text-xs btn-primary px-4 py-2">
              {leaveForm ? "キャンセル" : "＋ 欠席届を提出"}
            </button>
          </div>
          {leaveForm && (
            <div className="border-2 border-navy-200 rounded-xl p-4 bg-navy-50 mb-4">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="form-label text-xs">種別</label>
                  <select className="form-input text-sm" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                    {["欠席届", "遅刻届", "早退届"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2 col-span-1">
                  <div><label className="form-label text-xs">開始日</label><input type="date" className="form-input text-sm" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} /></div>
                  <div><label className="form-label text-xs">終了日</label><input type="date" className="form-input text-sm" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} /></div>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label text-xs">理由</label>
                <textarea className="form-input text-sm min-h-[70px]" placeholder="欠席・遅刻の理由を記入してください" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} />
              </div>
              <button onClick={handleLeaveSubmit} disabled={submitting} className="w-full btn-primary text-sm disabled:opacity-50">
                {submitting ? "送信中..." : "提出する"}
              </button>
            </div>
          )}
          <div className="space-y-2">
            {(portalData.leaveRequests || []).length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">提出した欠席届はありません</p>
            ) : (portalData.leaveRequests || []).map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{r.type}</p>
                  <p className="text-xs text-gray-500">{r.startDate} 〜 {r.endDate} · {r.reason.slice(0, 30)}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.status === "承認" ? "bg-green-100 text-green-700" : r.status === "却下" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 証明書申請 */}
      {tab === "cert" && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setCertForm(!certForm)} className="text-xs btn-primary px-4 py-2">
              {certForm ? "キャンセル" : "＋ 証明書を申請"}
            </button>
          </div>
          {certForm && (
            <div className="border-2 border-navy-200 rounded-xl p-4 bg-navy-50 mb-4">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="form-label text-xs">証明書の種類</label>
                  <select className="form-input text-sm" value={certType} onChange={e => setCertType(e.target.value)}>
                    {CERT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label text-xs">通数</label>
                  <input type="number" min={1} max={10} className="form-input text-sm" value={certCopies} onChange={e => setCertCopies(parseInt(e.target.value) || 1)} />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label text-xs">使用目的（任意）</label>
                <input type="text" className="form-input text-sm" placeholder="例：ビザ申請、アルバイト先提出" value={certPurpose} onChange={e => setCertPurpose(e.target.value)} />
              </div>
              <button onClick={handleCertSubmit} disabled={submitting} className="w-full btn-primary text-sm disabled:opacity-50">
                {submitting ? "申請中..." : "申請する"}
              </button>
            </div>
          )}
          <div className="space-y-2">
            {(portalData.certRequests || []).length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">証明書の申請はありません</p>
            ) : (portalData.certRequests || []).map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{r.type}</p>
                  <p className="text-xs text-gray-500">{r.copies}通 · {new Date(r.createdAt).toLocaleDateString("ja-JP")}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.status === "発行済" ? "bg-green-100 text-green-700" : r.status === "却下" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// ===== 在籍情報コンポーネント END =====

function StatusPageInner() {
  const { toast } = useUI();

  const [applicationNo, setApplicationNo] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplicationStatus | null>(null);

  // 入学手続き完了報告
  const [studentMemo, setStudentMemo] = useState("");
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollSubmitted, setEnrollSubmitted] = useState(false);

  // 書類アップロード
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, boolean>>({});

  // 電子署名
  const [signerName, setSignerName] = useState("");
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  // 基本情報変更申請
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [changeFieldDefs, setChangeFieldDefs] = useState<ChangeRequestFieldDef[]>([]);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [crFieldKey, setCrFieldKey] = useState("");
  const [crNewValue, setCrNewValue] = useState("");
  const [crReason, setCrReason] = useState("");
  const [crSubmitting, setCrSubmitting] = useState(false);
  const [crError, setCrError] = useState<string | null>(null);

  // URLパラメータから自動ロード
  const fetchStatus = useCallback(async (appNo: string, emailAddr: string) => {
    setAutoLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ applicationNo: appNo, email: emailAddr });
      const res = await fetch(`/api/applications/status?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(res.status >= 500
          ? "ただいま確認できませんでした。お手数ですが時間をおいて再度お試しください。"
          : "出願番号またはメールアドレスが一致しません。入力内容（半角・大文字小文字）をご確認のうえ再度お試しください。解決しない場合は学校までお問い合わせください。");
      } else {
        setResult(data);
        setStudentMemo(data.enrollmentProcedure?.studentMemo || "");
        setEnrollSubmitted(data.enrollmentProcedure?.status === "完了");
        setSignatureSaved(!!data.enrollmentSignature);
        const uploaded: Record<string, boolean> = {};
        for (const doc of data.documents || []) {
          if (doc.docType.startsWith("入学手続き_")) uploaded[doc.docType] = true;
        }
        setUploadedDocs(uploaded);

        // 並行して変更申請一覧 + フィールド定義を取得
        try {
          const crParams = new URLSearchParams({ applicationNo: appNo, email: emailAddr });
          const [crRes, defRes] = await Promise.all([
            fetch(`/api/applications/${data.id}/change-requests?${crParams}`),
            fetch(`/api/applications/${data.id}/change-requests`, { method: "OPTIONS" }),
          ]);
          if (crRes.ok) setChangeRequests(await crRes.json());
          if (defRes.ok) {
            const d = await defRes.json();
            setChangeFieldDefs(d.fields || []);
          }
        } catch { /* 失敗しても本体は表示する */ }
      }
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setAutoLoading(false);
    }
  }, []);

  useEffect(() => {
    // window.location.search を直接読む（useSearchParams は Static Generation では空になる）
    const sp = new URLSearchParams(window.location.search);
    const appNo = sp.get("applicationNo");
    const emailAddr = sp.get("email");
    if (appNo && emailAddr) {
      setApplicationNo(appNo);
      setEmail(emailAddr);
      fetchStatus(appNo, emailAddr);
    }
  }, [fetchStatus]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationNo.trim() || !email.trim()) {
      setError("申請番号とメールアドレスを入力してください");
      return;
    }
    setLoading(true);
    setResult(null);
    await fetchStatus(applicationNo.trim(), email.trim());
    setLoading(false);
  };

  /** 変更申請モーダルを開く（フィールド初期値を現在値でセット） */
  const openChangeModal = (fieldKey: string) => {
    if (!result) return;
    setCrFieldKey(fieldKey);
    const current = (result as unknown as Record<string, unknown>)[fieldKey];
    setCrNewValue(current == null ? "" : String(current));
    setCrReason("");
    setCrError(null);
    setShowChangeModal(true);
  };

  const submitChangeRequest = async () => {
    if (!result) return;
    if (!crFieldKey) { setCrError("項目を選択してください"); return; }
    if (!crNewValue.trim()) { setCrError("新しい値を入力してください"); return; }
    setCrSubmitting(true);
    setCrError(null);
    try {
      const res = await fetch(`/api/applications/${result.id}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationNo: result.applicationNo,
          email,
          fieldKey: crFieldKey,
          newValue: crNewValue.trim(),
          reason: crReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCrError(data.error || "申請に失敗しました");
        return;
      }
      setChangeRequests((prev) => [data, ...prev]);
      setShowChangeModal(false);
      toast("変更申請を送信しました。管理者の確認をお待ちください。", "success");
    } catch {
      setCrError("ネットワークエラー");
    } finally {
      setCrSubmitting(false);
    }
  };

  const withdrawChangeRequest = async (reqId: string) => {
    if (!result) return;
    const res = await fetch(`/api/applications/${result.id}/change-requests/${reqId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationNo: result.applicationNo, email }),
    });
    if (res.ok) {
      setChangeRequests((prev) => prev.filter((r) => r.id !== reqId));
      toast("申請を取り下げました", "info");
    } else {
      const err = await res.json().catch(() => ({}));
      toast(err.error || "取り下げに失敗しました", "error");
    }
  };

  const currentFieldDef = changeFieldDefs.find((f) => f.key === crFieldKey);

  const handleEnrollComplete = async () => {
    if (!result) return;
    setEnrollSubmitting(true);
    try {
      const res = await fetch("/api/enrollment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationNo: result.applicationNo,
          email,
          studentMemo,
          markComplete: true,
        }),
      });
      if (res.ok) {
        setEnrollSubmitted(true);
        toast("入学手続きの完了を報告しました", "success");
        setResult((prev) =>
          prev
            ? {
                ...prev,
                enrollmentProcedure: prev.enrollmentProcedure
                  ? { ...prev.enrollmentProcedure, status: "完了", studentMemo }
                  : null,
              }
            : null
        );
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "報告に失敗しました。もう一度お試しください。", "error");
      }
    } catch {
      toast("ネットワークエラーが発生しました", "error");
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const handleFileUpload = async (docType: string, file: File) => {
    if (!result) return;

    // クライアント側で先に検証（無駄なアップロードと長い待ち時間を防ぐ）
    const MAX_MB = 10;
    const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "webp"];
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      toast("PDF / JPG / PNG / WebP 形式のファイルを選択してください", "error");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast(`ファイルサイズは ${MAX_MB}MB 以下にしてください（選択: ${(file.size / 1024 / 1024).toFixed(1)}MB）`, "error");
      return;
    }

    setUploadingDocType(docType);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("applicationId", result.id);
      formData.append("docType", docType);
      // 学生（非管理者）からの呼び出しに必須の所有権チェック用
      formData.append("applicationNo", result.applicationNo);
      formData.append("email", email);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setUploadedDocs((prev) => ({ ...prev, [docType]: true }));
        const data = await res.json();
        const supersededIds: string[] = data.supersededDocumentIds || [];

        setResult((prev) => {
          if (!prev) return null;
          // 差し戻し書類があれば削除（同 docType の古いものを除去）
          const filtered = supersededIds.length > 0
            ? prev.documents.filter((d) => !supersededIds.includes(d.id))
            : prev.documents;
          return {
            ...prev,
            documents: [
              ...filtered,
              {
                id: data.document.id,
                docType: data.document.docType,
                fileName: data.document.fileName,
                originalName: data.document.originalName,
                uploadedAt: new Date().toISOString(),
                status: data.document.status || "提出済",
              },
            ],
          };
        });

        if (supersededIds.length > 0) {
          toast("差し戻し書類を新しいファイルで置き換えました", "success");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "アップロードに失敗しました", "error");
      }
    } catch {
      toast("ネットワークエラーが発生しました", "error");
    } finally {
      setUploadingDocType(null);
    }
  };

  const handleSignatureSave = async (dataUrl: string) => {
    if (!result || !signerName.trim()) {
      setSignatureError("署名者氏名を入力してください");
      return;
    }
    setSignatureSaving(true);
    setSignatureError(null);
    try {
      const res = await fetch("/api/enrollment/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationNo: result.applicationNo,
          email,
          signatureData: dataUrl,
          signerName: signerName.trim(),
        }),
      });
      if (res.ok) {
        setSignatureSaved(true);
        setResult((prev) =>
          prev
            ? {
                ...prev,
                enrollmentSignature: {
                  id: "saved",
                  signedAt: new Date().toISOString(),
                  signerName: signerName.trim(),
                },
              }
            : null
        );
      } else {
        const err = await res.json();
        setSignatureError(err.error || "署名の保存に失敗しました");
      }
    } catch {
      setSignatureError("ネットワークエラーが発生しました");
    } finally {
      setSignatureSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateOnly = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    }
    return dateStr;
  };

  const progressIndex = result
    ? getProgressIndex(result.status, result.enrollmentProcedure?.status)
    : -1;

  // 入学手続きチェックリスト
  const checklistItems: { name: string; required: boolean; done: boolean }[] = (() => {
    if (!result?.enrollmentProcedure?.docChecklist) return [];
    try {
      return JSON.parse(result.enrollmentProcedure.docChecklist);
    } catch {
      return [];
    }
  })();

  // 進捗計算
  const enrollmentProgress = (() => {
    if (!result?.enrollmentProcedure) return null;
    const hasAnyUpload = Object.values(uploadedDocs).some(Boolean);
    return {
      step1: !!result.enrollmentProcedure.publishedAt, // 案内確認
      step2: hasAnyUpload, // 書類アップロード
      step3: signatureSaved, // 署名完了
      step4: enrollSubmitted, // 完了報告
    };
  })();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy-800 text-white py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-navy-800 font-bold">専</span>
            </div>
            <h1 className="font-bold">専門学校 入学出願システム</h1>
          </div>
          <Link href="/" className="text-navy-200 hover:text-white text-sm transition-colors">
            ← トップへ戻る
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">

        {/* URLパラメータ自動ロード中 */}
        {autoLoading && (
          <div className="card space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </div>
        )}

        {!autoLoading && (
          <>
            {/* 合格後：手続き促進バナー（結果表示前 & 手続き未完了） */}
            {result && (result.status === "合格" || result.status === "補欠合格") &&
              result.enrollmentProcedure && result.enrollmentProcedure.status !== "完了" && (
              <div className="mb-6 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 text-white p-5 shadow-md">
                <div className="flex items-start gap-4">
                  <svg className="w-8 h-8 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-5a3 3 0 016 0v5M9 11h.01M15 11h.01" /></svg>
                  <div className="flex-1">
                    <p className="font-bold text-lg mb-1">入学手続きを完了してください</p>
                    <p className="text-green-100 text-sm mb-3">
                      {result.enrollmentProcedure.deadline
                        ? `手続き期限：${result.enrollmentProcedure.deadline.split("-").join("/")} まで`
                        : "下記の手続きを順番に完了してください"}
                    </p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {[
                        { label: "① 書類アップロード", done: Object.values(uploadedDocs).some(Boolean) },
                        { label: "② 電子署名", done: signatureSaved },
                        { label: "③ 完了報告", done: enrollSubmitted },
                      ].map((s, i) => (
                        <span key={i} className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${s.done ? "bg-white/30 line-through opacity-70" : "bg-white text-green-700"}`}>
                          {s.done && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 検索フォーム（結果表示時は折りたたみ） */}
            {!result ? (
              <>
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-navy-800">出願状況の確認</h2>
                  <p className="text-gray-500 mt-1 text-sm">
                    申請番号と登録したメールアドレスで現在の審査状況をご確認いただけます。書類アップロードや選考料お支払いの続きもこちらから行えます。
                  </p>
                </div>
                <div className="card mb-6">
                  <form onSubmit={handleSearch} className="space-y-4">
                    <div>
                      <label className="form-label">申請番号<span className="form-required">*</span></label>
                      <input
                        type="text"
                        className="form-input font-mono"
                        placeholder="APP-20240401-XXXX"
                        value={applicationNo}
                        onChange={(e) => setApplicationNo(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div>
                      <label className="form-label">メールアドレス<span className="form-required">*</span></label>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="example@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
                    )}
                    <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                      {loading ? (
                        <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>確認中...</>
                      ) : "状況を確認する"}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              /* 結果表示中：コンパクトなヘッダー */
              <div className="flex items-center justify-between mb-4 px-1">
                <div>
                  <p className="text-xs text-gray-400">ログイン中</p>
                  <p className="font-mono text-sm font-bold text-navy-800">{result.applicationNo}</p>
                </div>
                <button
                  onClick={() => { setResult(null); setError(null); setApplicationNo(""); setEmail(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg"
                >
                  別の申請を確認
                </button>
              </div>
            )}

        {/* 結果表示 */}
        {result && (
          <div className="space-y-4">
            <div className="card">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-sm text-gray-500 mb-1">申請番号</p>
                  <p className="font-mono font-bold text-lg text-navy-800">
                    {result.applicationNo}
                  </p>
                </div>
                {(() => {
                  const hasRejection = (result.documents || []).some((d) => d.status === "差し戻し" && !d.docType.startsWith("入学手続き_"));
                  // 書類差し戻しがある時は本ステータスより「差し戻し中」を優先表示（学生視点で一番大事な情報）
                  if (hasRejection) {
                    return (
                      <span className="status-badge text-sm px-3 py-1 bg-red-100 text-red-700 border-red-200 inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                        </svg>
                        差し戻し中
                      </span>
                    );
                  }
                  return (
                    <span className={`status-badge text-sm px-3 py-1 ${getStatusStyle(result.status)}`}>
                      {result.status}
                    </span>
                  );
                })()}
              </div>

              {/* 合格カード */}
              {result.status === "合格" && (
                <div className="rounded-xl p-5 mb-6 bg-green-50 border-2 border-green-400 text-center">
                  <svg className="w-10 h-10 mx-auto mb-2 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                  <p className="text-green-800 text-xl font-bold mb-1">合格おめでとうございます！</p>
                  <p className="text-green-700 text-sm mb-4">
                    書類審査・面接の結果、合格と決定いたしました。<br />
                    入学手続きに関するご案内をご確認ください。
                  </p>
                  {/* 合格通知書ダウンロード */}
                  <a
                    href={`/api/documents/admission-letter?applicationNo=${result.applicationNo}&email=${encodeURIComponent(email)}&type=admission_notice`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    合格通知書をダウンロード（PDF）
                  </a>
                </div>
              )}

              {/* 補欠合格カード */}
              {result.status === "補欠合格" && (
                <div className="rounded-xl p-5 mb-6 bg-orange-50 border-2 border-orange-300">
                  <div className="flex items-center gap-3 mb-3">
                    <svg className="w-6 h-6 text-orange-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5h6a1 1 0 011 1v0a1 1 0 01-1 1H9a1 1 0 01-1-1v0a1 1 0 011-1zM8 6H6a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2M9 12h6M9 16h4" /></svg>
                    <p className="text-orange-800 text-lg font-bold">補欠合格のご通知</p>
                  </div>
                  <p className="text-orange-700 text-sm leading-relaxed mb-3">
                    審査の結果、あなたの実力は<strong>合格基準を十分に満たしています</strong>。<br />
                    ただし、今回は定員の関係により、補欠合格という形でのご通知となりました。
                  </p>
                  <div className="bg-orange-100 rounded-lg p-3 text-sm text-orange-800">
                    <p className="font-semibold mb-1 flex items-center gap-1.5">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v7m0 0l8 4v9H4v-9l8-4z" /></svg>
                      今後の流れについて
                    </p>
                    <p className="leading-relaxed">
                      他の合格者の入学辞退が発生した場合、<strong>速やかにご連絡し、正式合格をご案内</strong>いたします。
                    </p>
                  </div>
                </div>
              )}

              {/* 不合格カード */}
              {result.status === "不合格" && (
                <div className="rounded-xl p-5 mb-6 bg-gray-50 border border-gray-300">
                  <p className="text-gray-700 text-base font-semibold mb-1">審査結果のご連絡</p>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    慎重に審査を行いました結果、誠に残念ながら今回はご期待に添えない結果となりました。<br />
                    今後のご活躍を心よりお祈り申し上げます。
                  </p>
                </div>
              )}

              {/* 書類待ち：続きをする（書類アップロード・選考料支払い） */}
              {result.status === "書類待ち" && (
                <div className="rounded-xl p-5 mb-6 bg-amber-50 border-2 border-amber-300">
                  <div className="flex items-center gap-3 mb-3">
                    <svg className="w-6 h-6 text-amber-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5h6a1 1 0 011 1v0a1 1 0 01-1 1H9a1 1 0 01-1-1v0a1 1 0 011-1zM8 6H6a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2M9 12h6M9 16h4" /></svg>
                    <div>
                      <p className="font-bold text-amber-800 text-base">書類アップロード・選考料のお支払いが未完了です</p>
                      <p className="text-amber-700 text-xs mt-0.5">出願番号が発行されています。続きの手続きを完了してください。</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white rounded-lg border border-amber-200 p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">書類</p>
                      <p className={`text-lg font-bold ${result.documents.length > 0 ? "text-green-600" : "text-amber-600"}`}>
                        {result.documents.length > 0 ? `${result.documents.length}件提出済み` : "未提出"}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg border border-amber-200 p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">選考料</p>
                      <p className="text-lg font-bold text-amber-600">未払い</p>
                    </div>
                  </div>
                  <a
                    href={`/apply?resume=1&applicationNo=${result.applicationNo}&email=${encodeURIComponent(email)}`}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition"
                  >
                    続きをする（書類アップロード・選考料）→
                  </a>
                </div>
              )}

              {/* その他ステータス説明（書類差し戻し時は冗長になるので非表示） */}
              {(() => {
                const hasRejection = (result.documents || []).some((d) => d.status === "差し戻し" && !d.docType.startsWith("入学手続き_"));
                const skipBox =
                  result.status === "合格" ||
                  result.status === "補欠合格" ||
                  result.status === "不合格" ||
                  result.status === "書類待ち" ||
                  hasRejection;
                if (skipBox) return null;
                return (
                  <div className="rounded-xl p-4 mb-6 bg-blue-50 border border-blue-200">
                    <p className="text-sm font-medium text-blue-800">
                      {({
                        受付中: "申請を受け付けました。書類の確認を行います。",
                        書類確認中: "提出された書類を確認中です。",
                        面接待ち: "書類審査が完了しました。面接の日程をご確認ください。",
                        保留: "審査を保留しています。追加書類が必要な場合はご連絡します。",
                      } as Record<string, string>)[result.status] || "審査中です。"}
                    </p>
                  </div>
                );
              })()}

              {/* 管理者からのコメント（学生公開フラグ ON の AdminNote のみ） */}
              {result.adminNotes && result.adminNotes.length > 0 && (
                <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white overflow-hidden">
                  <div className="px-5 py-3 bg-emerald-50/80 border-b border-emerald-100 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.4-4 8-9 8a9.9 9.9 0 0 1-4.5-1L3 20l1-3.5A8 8 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
                    </svg>
                    <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                      事務局からのお知らせ
                    </p>
                    <span className="ml-auto text-[10px] font-semibold text-emerald-700 bg-white px-2 py-0.5 rounded-full ring-1 ring-emerald-200">
                      {result.adminNotes.length}件
                    </span>
                  </div>
                  <ul className="divide-y divide-emerald-100">
                    {result.adminNotes.map((note) => (
                      <li key={note.id} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-1.5 gap-2 text-xs">
                          <span className="font-semibold text-emerald-900">{note.author}</span>
                          <time className="text-emerald-700/70" dateTime={note.createdAt}>
                            {new Date(note.createdAt).toLocaleString("ja-JP", {
                              year: "numeric", month: "2-digit", day: "2-digit",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                          {note.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 進捗バー */}
              {/* 不合格・保留：進捗を消さず終端状態を表示 */}
              {(result.status === "不合格" || result.status === "保留") && (() => {
                const isHold = result.status === "保留";
                const steps = ["受付", "書類審査", "面接", isHold ? "審査保留中" : "選考終了"];
                return (
                  <div className="mb-6">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-4">審査の進捗</p>
                    <div className="relative">
                      <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200" />
                      <div className={`absolute top-4 left-4 right-4 h-0.5 ${isHold ? "bg-amber-400" : "bg-gray-400"}`} />
                      <div className="relative flex justify-between">
                        {steps.map((label, i) => {
                          const isTerminal = i === steps.length - 1;
                          return (
                            <div key={label} className="flex flex-col items-center" style={{ width: `${100 / steps.length}%` }}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 z-10 ${
                                isTerminal
                                  ? (isHold ? "bg-amber-500 border-amber-500 text-white" : "bg-gray-400 border-gray-400 text-white")
                                  : "bg-navy-800 border-navy-800 text-white"
                              }`}>
                                {isTerminal ? (
                                  isHold ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>
                                  )
                                ) : (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                )}
                              </div>
                              <span className={`text-center leading-tight mt-1 ${isTerminal ? (isHold ? "text-amber-700 font-bold" : "text-gray-600 font-bold") : "text-navy-600"}`} style={{ fontSize: "10px" }}>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {result.status !== "不合格" && result.status !== "保留" && result.status !== "補欠合格" && (() => {
                // 書類に差し戻しがある場合、書類確認中ステップを「差し戻し中」表示にする
                const rejectedDocs = (result.documents || []).filter((d) => d.status === "差し戻し" && !d.docType.startsWith("入学手続き_"));
                const hasRejection = rejectedDocs.length > 0;
                // 差し戻し時は書類確認中（index=1）の手前で止まったように見せる
                const effectiveProgress = hasRejection ? Math.min(progressIndex, 1) : progressIndex;

                return (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4 gap-2">
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                        審査の進捗
                      </p>
                      {hasRejection && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full ring-1 ring-red-200">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 4.5l9 15.5H3z" />
                          </svg>
                          差し戻し対応中
                        </span>
                      )}
                    </div>

                    {/* 差し戻し警告バナー */}
                    {hasRejection && (
                      <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-red-900">書類が差し戻されました（{rejectedDocs.length}件）</p>
                          <p className="text-xs text-red-700 mt-0.5">
                            下の「提出書類」欄から修正版を再アップロードしてください。再提出されると審査が再開されます。
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200" />
                      <div
                        className={`absolute top-4 left-4 h-0.5 transition-all duration-500 ${hasRejection ? "bg-red-500" : "bg-navy-700"}`}
                        style={{
                          width:
                            effectiveProgress <= 0
                              ? "0%"
                              : `${(effectiveProgress / (PROGRESS_STEPS.length - 1)) * 100}%`,
                        }}
                      />
                      <div className="relative flex justify-between">
                        {PROGRESS_STEPS.map((step, i) => {
                          const isCompleted = i < effectiveProgress;
                          const isCurrent = i === effectiveProgress;
                          // 書類確認中ステップ（index=1）が現在地で、差し戻しがある場合は赤くする
                          const isRejectionStep = hasRejection && step.key === "書類確認中" && isCurrent;
                          const label = isRejectionStep ? "差し戻し中" : step.label;
                          return (
                            <div key={step.key} className="flex flex-col items-center" style={{ width: `${100 / PROGRESS_STEPS.length}%` }}>
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 z-10 ${
                                  isRejectionStep
                                    ? "bg-red-600 border-red-600 text-white animate-pulse"
                                    : isCompleted
                                    ? "bg-navy-800 border-navy-800 text-white"
                                    : isCurrent
                                    ? "bg-white border-navy-800 text-navy-800"
                                    : "bg-white border-gray-300 text-gray-400"
                                }`}
                              >
                                {isRejectionStep ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                                  </svg>
                                ) : isCompleted ? (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                ) : (
                                  i + 1
                                )}
                              </div>
                              <span
                                className={`text-xs mt-1 text-center leading-tight ${
                                  isRejectionStep
                                    ? "text-red-700 font-bold"
                                    : isCurrent
                                    ? "text-navy-800 font-bold"
                                    : isCompleted
                                    ? "text-navy-600"
                                    : "text-gray-400"
                                }`}
                                style={{ fontSize: "10px" }}
                              >
                                {label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 申請者情報 */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">申請者情報</p>
                {result.status !== "完了" && result.status !== "辞退" && result.status !== "不合格" && (
                  <button
                    type="button"
                    onClick={() => { setCrFieldKey(""); setCrNewValue(""); setCrReason(""); setCrError(null); setShowChangeModal(true); }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    情報の変更を申請する
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="text-gray-500">氏名</p>
                  <p className="font-medium">{result.lastName} {result.firstName}</p>
                </div>
                <div>
                  <p className="text-gray-500">志望校・学科</p>
                  <p className="font-medium">{result.schoolName}</p>
                  <p className="text-gray-600">{result.department}</p>
                </div>
                <div>
                  <p className="text-gray-500">入学希望</p>
                  <p className="font-medium">{result.enrollmentYear}年{result.enrollmentMonth}月</p>
                </div>
                <div>
                  <p className="text-gray-500">申請日</p>
                  <p className="font-medium">{formatDate(result.createdAt)}</p>
                </div>
              </div>

              {/* 変更申請履歴（あれば表示） */}
              {changeRequests.length > 0 && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                  <p className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    基本情報の変更申請（{changeRequests.length}件）
                  </p>
                  <ul className="space-y-1.5">
                    {changeRequests.map((r) => {
                      const badge = r.status === "申請中" ? "bg-amber-100 text-amber-800"
                                 : r.status === "承認" ? "bg-green-100 text-green-800"
                                 : "bg-red-100 text-red-700";
                      return (
                        <li key={r.id} className="bg-white rounded-lg px-3 py-2 text-xs border border-amber-100">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="font-semibold text-gray-800 flex-1 min-w-0 truncate">
                              {r.fieldLabel}: 「{r.oldValue ?? "(空欄)"}」→「{r.newValue}」
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${badge}`}>{r.status}</span>
                          </div>
                          {r.reason && <p className="text-gray-500 text-[11px]">理由: {r.reason}</p>}
                          {r.reviewerNote && <p className="text-gray-500 text-[11px]">管理者: {r.reviewerNote}</p>}
                          {r.status === "申請中" && (
                            <button
                              onClick={() => withdrawChangeRequest(r.id)}
                              className="mt-1 text-[10px] text-gray-500 hover:text-red-600"
                            >取り下げる</button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* 提出書類 */}
              {result.documents.filter(d => !d.docType.startsWith("入学手続き_")).length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    提出書類（{result.documents.filter(d => !d.docType.startsWith("入学手続き_")).length}件）
                  </p>
                  <div className="space-y-2">
                    {result.documents.filter(d => !d.docType.startsWith("入学手続き_")).map((doc) => {
                      const ds = doc.status || "提出済";
                      const BAR: Record<string, string> = {
                        "提出済": "bg-gray-50 border-gray-200",
                        "確認済": "bg-green-50 border-green-200",
                        "差し戻し": "bg-red-50 border-red-300",
                      };
                      const BADGE: Record<string, string> = {
                        "提出済": "bg-gray-200 text-gray-700",
                        "確認済": "bg-green-600 text-white",
                        "差し戻し": "bg-red-600 text-white",
                      };
                      const isReuploading = uploadingDocType === doc.docType;
                      return (
                        <div key={doc.id} className={`border rounded-lg px-3 py-2 ${BAR[ds]}`}>
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <span className={`status-badge ${BADGE[ds]}`}>{ds}</span>
                            <span className="font-medium text-gray-800">{doc.docType}</span>
                            <span className="text-gray-400 text-xs truncate flex-1 min-w-0">— {doc.originalName}</span>
                          </div>
                          {ds === "差し戻し" && (
                            <div className="mt-2 space-y-2">
                              {doc.rejectReason && (
                                <div className="text-xs text-red-800 bg-white rounded px-2 py-1.5 border border-red-200">
                                  <span className="font-bold">差し戻し理由：</span>{doc.rejectReason}
                                </div>
                              )}
                              {/* 再アップロード UI */}
                              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-red-200">
                                <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
                                </svg>
                                <span className="text-xs text-gray-700 flex-1 min-w-0">
                                  <span className="font-semibold text-red-700">修正版をアップロード</span>
                                  <span className="text-gray-500 ml-1 block sm:inline">PDF / JPG / PNG・最大10MB</span>
                                </span>
                                <label className={`shrink-0 cursor-pointer text-xs px-3 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border font-bold transition-colors ${
                                  isReuploading
                                    ? "opacity-50 bg-gray-100 border-gray-200 text-gray-400 cursor-wait"
                                    : "bg-red-600 border-red-600 text-white hover:bg-red-700"
                                }`}>
                                  {isReuploading ? (<><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>送信中...</>) : "再アップロード"}
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                                    disabled={isReuploading}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleFileUpload(doc.docType, f);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 受験票ダウンロード — 書類審査通過 + 試験日程確定 が条件。併願時は志望校ごとに発行可。 */}
              {(() => {
                if (!["受付中", "書類確認中", "面接待ち"].includes(result.status)) return null;
                const isReady = result.status === "面接待ち";
                const hasRejection = (result.documents || []).some((d) => d.status === "差し戻し");
                const schools = result.applicationSchools || [];

                // 各志望校に対する有効な試験日（第1志望は Application-level にフォールバック）
                const tickets = schools.length > 0
                  ? schools.map((s) => {
                      const d = s.interviewDate || (s.priority === 1 ? result.interviewDate : null);
                      const t = s.interviewTime || (s.priority === 1 ? result.interviewTime : null);
                      return {
                        id: s.id,
                        priority: s.priority,
                        label: ["第1志望", "第2志望", "第3志望"][s.priority - 1] || `第${s.priority}志望`,
                        schoolName: s.schoolName,
                        department: s.department,
                        date: d,
                        time: t,
                        hasSlot: !!d,
                      };
                    })
                  : [{
                      id: null as string | null,
                      priority: 1,
                      label: null as string | null,
                      schoolName: result.schoolName,
                      department: result.department,
                      date: result.interviewDate,
                      time: result.interviewTime,
                      hasSlot: !!result.interviewDate,
                    }];

                const someCanDownload = isReady && !hasRejection && tickets.some((t) => t.hasSlot);
                const overallReady = isReady && !hasRejection;

                return (
                  <div className={`mt-4 p-4 border rounded-xl ${someCanDownload ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                    <p className={`text-sm font-bold mb-2 flex items-center gap-1.5 ${someCanDownload ? "text-blue-900" : "text-gray-700"}`}>
                      <Icon name="ticket" className="w-4 h-4" /> 受験票ダウンロード
                      {tickets.length > 1 && <span className="ml-1 text-xs font-normal text-gray-500">（志望校ごと）</span>}
                    </p>

                    {!overallReady ? (
                      <ul className="text-xs text-gray-600 mt-1 space-y-1">
                        <li className="flex items-center gap-1.5">
                          <span className={isReady ? "text-green-600" : "text-gray-400"} aria-hidden="true">
                            <Icon name={isReady ? "check" : "info"} className="w-3.5 h-3.5" />
                          </span>
                          書類審査通過
                          <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isReady ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {isReady ? "完了" : "未完了"}
                          </span>
                          <span className="text-gray-400">(現在: {result.status})</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className={!hasRejection ? "text-green-600" : "text-red-600"} aria-hidden="true">
                            <Icon name={!hasRejection ? "check" : "info"} className="w-3.5 h-3.5" />
                          </span>
                          差し戻し書類がない
                          <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${!hasRejection ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {!hasRejection ? "完了" : "未完了"}
                          </span>
                          {hasRejection && <span className="text-red-600 ml-1">— 再提出が必要です</span>}
                        </li>
                        <li className="text-gray-500 pt-1">条件が揃うとダウンロード可能になります。</li>
                      </ul>
                    ) : (
                      <div className="space-y-2">
                        {tickets.map((t) => {
                          const can = t.hasSlot;
                          const params = new URLSearchParams({
                            applicationNo: result.applicationNo,
                            email,
                            ...(t.id ? { schoolId: t.id } : { priority: String(t.priority) }),
                          });
                          return (
                            <div key={t.id || t.priority} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${can ? "bg-white border border-blue-200" : "bg-gray-50 border border-gray-200"}`}>
                              <div className="min-w-0 flex-1">
                                {t.label && (
                                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mb-0.5 ${
                                    t.priority === 1 ? "bg-navy-800 text-white" : t.priority === 2 ? "bg-navy-200 text-navy-700" : "bg-gray-100 text-gray-600"
                                  }`}>{t.label}</span>
                                )}
                                <p className="text-xs font-semibold text-gray-800 truncate">{t.schoolName}</p>
                                <p className="text-[11px] text-gray-500 truncate">
                                  {t.department}
                                  {t.date && <span className="ml-1">／ {t.date}{t.time ? ` ${t.time}` : ""}</span>}
                                </p>
                              </div>
                              {can ? (
                                <a
                                  href={`/api/documents/exam-ticket?${params.toString()}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 px-3 min-h-[36px] inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold rounded-lg whitespace-nowrap transition-all"
                                >
                                  <Icon name="ticket" className="w-3.5 h-3.5" /> 受験票
                                </a>
                              ) : (
                                <span className="shrink-0 text-[11px] text-gray-400">日程未確定</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 結果公開待ちのお知らせ */}
              {result.resultEmbargoed && result.resultPublishedAt && (
                <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm font-bold text-amber-900">⏳ 合否結果は <span className="font-mono">{new Date(result.resultPublishedAt).toLocaleString("ja-JP")}</span> に公開予定です</p>
                  <p className="text-xs text-amber-700 mt-1">公開日時前は審査中と表示されます。公開後にこのページで結果をご確認いただけます。</p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  最終更新：{formatDate(result.updatedAt)}
                </p>
              </div>
            </div>

            {/* 試験詳細カード（併願対応：志望校ごと × 筆記/面接 2 サブセクション） */}
            {result.status === "面接待ち" && (() => {
              const fallbackDate = result.interviewDate;
              const fallbackTime = result.interviewTime;
              const fallbackPlace = result.interviewPlace;
              const fallbackNotes = result.interviewNotes;
              const schools = result.applicationSchools || [];

              const hasAny = (s: NonNullable<typeof schools>[number]) =>
                !!(s.interviewDate || s.interviewTime || s.interviewPlace ||
                   s.writtenExamDate || s.writtenExamTime || s.writtenExamPlace || s.writtenExamExempted);

              const usePerSchool = schools.length > 0 && schools.some(hasAny);
              type SubData = { date: string | null; time: string | null; place: string | null; notes: string | null };
              type Card = {
                label: string | null;
                schoolName: string;
                department: string;
                interview: SubData;
                written:   SubData & { exempted: boolean };
              };
              const cardsData: Card[] = usePerSchool
                ? schools.map((s) => ({
                    label: ["第1志望", "第2志望", "第3志望"][s.priority - 1] || `第${s.priority}志望`,
                    schoolName: s.schoolName,
                    department: s.department,
                    interview: {
                      date:  s.interviewDate  || (s.priority === 1 ? fallbackDate  : null),
                      time:  s.interviewTime  || (s.priority === 1 ? fallbackTime  : null),
                      place: s.interviewPlace || (s.priority === 1 ? fallbackPlace : null),
                      notes: s.interviewNotes || (s.priority === 1 ? fallbackNotes : null),
                    },
                    written: {
                      date:  s.writtenExamDate  ?? null,
                      time:  s.writtenExamTime  ?? null,
                      place: s.writtenExamPlace ?? null,
                      notes: s.writtenExamNotes ?? null,
                      exempted: !!s.writtenExamExempted,
                    },
                  }))
                : fallbackDate
                  ? [{
                      label: null,
                      schoolName: result.schoolName,
                      department: result.department,
                      interview: { date: fallbackDate, time: fallbackTime, place: fallbackPlace, notes: fallbackNotes },
                      written:   { date: null, time: null, place: null, notes: null, exempted: false },
                    }]
                  : [];

              if (cardsData.length === 0) return null;

              const renderSub = (kind: "written" | "interview", data: SubData & { exempted?: boolean }) => {
                const isWritten = kind === "written";
                const title = isWritten ? "筆記試験" : "面接試験";
                const titleColor = isWritten ? "text-blue-800" : "text-amber-800";
                const subtleText = isWritten ? "text-blue-700" : "text-amber-700";
                const bg = isWritten ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200";
                const isExempted = isWritten && data.exempted;
                const hasData = !!(data.date || data.time || data.place);

                return (
                  <div className={`rounded-lg border ${bg} p-3`}>
                    <p className={`text-xs font-bold ${titleColor} mb-2`}>{title}</p>
                    {isExempted ? (
                      <div className="text-center py-3 px-2 rounded-md border-2 border-dashed border-blue-300 bg-white">
                        <p className="text-base font-bold text-blue-800 tracking-widest">免　除</p>
                        <p className="text-[11px] text-blue-600 mt-1">この出願では筆記試験が免除されます</p>
                      </div>
                    ) : hasData ? (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex gap-3">
                          <span className={`${subtleText} w-14 flex-shrink-0`}>日付</span>
                          <span className="text-gray-900 font-semibold">{data.date ? formatDateOnly(data.date) : "—"}</span>
                        </div>
                        {data.time && (
                          <div className="flex gap-3">
                            <span className={`${subtleText} w-14 flex-shrink-0`}>時間</span>
                            <span className="text-gray-900 font-semibold">{data.time}</span>
                          </div>
                        )}
                        {data.place && (
                          <div className="flex gap-3">
                            <span className={`${subtleText} w-14 flex-shrink-0`}>{isWritten ? "試験会場" : "面接会場"}</span>
                            <span className="text-gray-900">{data.place}</span>
                          </div>
                        )}
                        {data.notes && (
                          <div className="flex gap-3 pt-1">
                            <span className={`${subtleText} w-14 flex-shrink-0`}>注意</span>
                            <span className="text-gray-800 whitespace-pre-line">{data.notes}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-500 italic text-center py-2">日程未定</p>
                    )}
                  </div>
                );
              };

              return (
                <div className="card border-l-4 border-blue-500">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-blue-900">
                      {usePerSchool ? "試験のご案内（志望校別）" : "試験のご案内"}
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {cardsData.map((c, idx) => (
                      <div key={idx} className="rounded-lg p-3 space-y-2 border border-gray-200 bg-gray-50/50">
                        {c.label && (
                          <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              idx === 0 ? "bg-navy-800 text-white" : idx === 1 ? "bg-navy-200 text-navy-700" : "bg-gray-100 text-gray-600"
                            }`}>{c.label}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{c.schoolName}</p>
                              <p className="text-[11px] text-gray-600 truncate">{c.department}</p>
                            </div>
                          </div>
                        )}
                        {renderSub("written", c.written)}
                        {renderSub("interview", c.interview)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 入学手続きカード */}
            {(result.status === "合格" || result.status === "補欠合格") && result.enrollmentProcedure && (
              <div className="card border-l-4 border-green-500">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-green-900">入学手続きのご案内</h3>
                  {result.enrollmentProcedure.status === "完了" && (
                    <span className="ml-auto text-xs bg-green-600 text-white px-2 py-1 rounded-full">
                      手続き完了
                    </span>
                  )}
                </div>

                {/* 案内文 */}
                {result.enrollmentProcedure.instructions && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-5">
                    <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                      {result.enrollmentProcedure.instructions}
                    </p>
                  </div>
                )}

                {(() => {
                  const ep = result.enrollmentProcedure!;
                  const step1Done = Object.values(uploadedDocs).some(v => v) || false; // 振込証明書アップロード済み
                  const step2Done = checklistItems.length > 0
                    ? checklistItems.filter(i => i.required).every(i => uploadedDocs[`入学手続き_${i.name}`])
                    : false;
                  const step3Done = signatureSaved || !!result.enrollmentSignature;
                  const allDone = step1Done && step2Done && step3Done;

                  // 提出期限の超過判定（期限日の終わり 23:59 まで有効）。未完了のステップのみロック対象。
                  const isPastDeadline = (d: string | null) => {
                    if (!d) return false;
                    const due = new Date(d);
                    if (isNaN(due.getTime())) return false;
                    due.setHours(23, 59, 59, 999);
                    return new Date() > due;
                  };
                  const step1Expired = !step1Done && isPastDeadline(ep.step1Deadline);
                  const step2Expired = step1Done && !step2Done && isPastDeadline(ep.step2Deadline);
                  const step3Expired = step1Done && step2Done && !step3Done && isPastDeadline(ep.step3Deadline);
                  const expiredBanner = (label: string) => (
                    <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.01M10.34 4.66l-7.1 12.3A1.5 1.5 0 004.55 19.5h14.9a1.5 1.5 0 001.31-2.54l-7.1-12.3a1.5 1.5 0 00-2.62 0z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-red-800">{label}の提出期限を超過しています</p>
                        <p className="text-xs text-red-700 mt-0.5">このままでは手続きを受け付けられない場合があります。お手数ですが入学相談室までお問い合わせください。</p>
                      </div>
                    </div>
                  );

                  return (
                    <div className="space-y-4">

                      {/* STEP 1: 学費納入 */}
                      <div className={`rounded-xl border-2 overflow-hidden ${step1Done ? "border-green-300" : "border-blue-300"}`}>
                        <div className={`px-4 py-3 flex items-center justify-between ${step1Done ? "bg-green-50" : "bg-blue-50"}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${step1Done ? "bg-green-500 text-white" : "bg-blue-600 text-white"}`}>
                              {step1Done ? "✓" : "1"}
                            </div>
                            <p className={`text-sm font-bold ${step1Done ? "text-green-700" : "text-blue-800"}`}>
                              学費の納入（振込）
                            </p>
                          </div>
                          {ep.step1Deadline && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${step1Done ? "bg-green-100 text-green-600" : step1Expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {step1Expired ? "期限超過" : `期限：${formatDateOnly(ep.step1Deadline)}`}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          {/* 振込先 */}
                          {ep.tuitionBankInfo && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                              <p className="text-xs font-bold text-blue-800 mb-1">振込先情報</p>
                              <p className="text-xs text-blue-900 whitespace-pre-line font-mono leading-relaxed">{ep.tuitionBankInfo}</p>
                            </div>
                          )}
                          {/* 金額 */}
                          <div className={`rounded-lg p-3 mb-3 ${ep.tuitionPlan === "分割（2期）" ? "bg-purple-50 border border-purple-200" : "bg-gray-50 border border-gray-200"}`}>
                            <p className="text-xs font-bold text-gray-700 mb-2">
                              {ep.tuitionPlan === "分割（2期）" ? "分割払い（2期）" : "全額一括払い"}
                            </p>
                            {ep.tuitionAmount && (
                              <div className="flex justify-between items-center text-sm mb-1">
                                <span className="text-gray-600">{ep.tuitionPlan === "分割（2期）" ? "第1期" : "金額"}</span>
                                <span className="font-bold text-gray-900">{ep.tuitionAmount}</span>
                              </div>
                            )}
                            {ep.tuitionPlan === "分割（2期）" && ep.tuitionAmount2 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600">第2期{ep.tuitionDeadline2 ? `（${formatDateOnly(ep.tuitionDeadline2)}まで）` : ""}</span>
                                <span className="font-bold text-gray-900">{ep.tuitionAmount2}</span>
                              </div>
                            )}
                          </div>
                          {/* 振込証明書アップロード */}
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-2">振込完了後、振込証明書（レシート・明細）をアップロードしてください</p>
                            {step1Expired ? expiredBanner("学費納入") : (() => {
                              const docKey = "入学手続き_振込証明書";
                              const isUploaded = uploadedDocs[docKey] || false;
                              const isUploading = uploadingDocType === docKey;
                              return (
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isUploaded ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isUploaded ? "bg-green-500" : "bg-gray-200"}`}>
                                    {isUploaded && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                  </div>
                                  <span className={`flex-1 text-sm ${isUploaded ? "text-green-700 font-medium" : "text-gray-700"}`}>
                                    振込証明書{isUploaded ? "（アップロード済み）" : ""}
                                  </span>
                                  <label className={`shrink-0 cursor-pointer text-xs px-3 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border transition-colors ${isUploading ? "opacity-50 bg-gray-100 border-gray-200 text-gray-400 cursor-wait" : isUploaded ? "bg-white border-gray-300 text-gray-600" : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"}`}>
                                    {isUploading ? (<><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>送信中...</>) : isUploaded ? "再アップロード" : "ファイルを選択"}
                                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={isUploading}
                                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(docKey, f); e.target.value = ""; }} />
                                  </label>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* STEP 2: 書類提出 */}
                      <div className={`rounded-xl border-2 overflow-hidden ${!step1Done ? "opacity-50" : step2Done ? "border-green-300" : "border-purple-300"}`}>
                        <div className={`px-4 py-3 flex items-center justify-between ${step2Done ? "bg-green-50" : "bg-purple-50"}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${step2Done ? "bg-green-500 text-white" : step1Done ? "bg-purple-600 text-white" : "bg-gray-300 text-white"}`}>
                              {step2Done ? "✓" : "2"}
                            </div>
                            <p className={`text-sm font-bold ${step2Done ? "text-green-700" : "text-purple-800"}`}>
                              必要書類の提出
                            </p>
                          </div>
                          {ep.step2Deadline && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${step2Done ? "bg-green-100 text-green-600" : step2Expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {step2Expired ? "期限超過" : `期限：${formatDateOnly(ep.step2Deadline)}`}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          {!step1Done && <p className="text-xs text-gray-400 text-center py-2">STEP 1（学費納入）を完了してから進んでください</p>}
                          {step1Done && (step2Expired ? expiredBanner("書類提出") : (
                            <div className="divide-y divide-gray-100">
                              {checklistItems.map((item, i) => {
                                const docKey = `入学手続き_${item.name}`;
                                const isUploaded = uploadedDocs[docKey] || false;
                                const isUploading = uploadingDocType === docKey;
                                return (
                                  <div key={i} className={`flex items-center gap-3 py-2.5 ${isUploaded ? "" : ""}`}>
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isUploaded ? "bg-green-500" : "bg-gray-200"}`}>
                                      {isUploaded && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className={`text-sm ${isUploaded ? "text-green-700 font-medium" : "text-gray-700"}`}>{item.name}</span>
                                      {item.required && !isUploaded && <span className="ml-1.5 text-xs text-red-600 font-semibold">必須</span>}
                                    </div>
                                    <label className={`shrink-0 cursor-pointer text-xs px-3 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border ${isUploading ? "opacity-50 bg-gray-100 border-gray-200 text-gray-400 cursor-wait" : isUploaded ? "bg-white border-gray-300 text-gray-600" : "bg-purple-600 border-purple-600 text-white hover:bg-purple-700"}`}>
                                      {isUploading ? (<><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>送信中...</>) : isUploaded ? "再UP" : "選択"}
                                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={isUploading}
                                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(docKey, f); e.target.value = ""; }} />
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* STEP 3: 電子署名 */}
                      <div className={`rounded-xl border-2 overflow-hidden ${!step1Done || !step2Done ? "opacity-50" : step3Done ? "border-green-300" : "border-teal-300"}`}>
                        <div className={`px-4 py-3 flex items-center justify-between ${step3Done ? "bg-green-50" : "bg-teal-50"}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${step3Done ? "bg-green-500 text-white" : (step1Done && step2Done) ? "bg-teal-600 text-white" : "bg-gray-300 text-white"}`}>
                              {step3Done ? "✓" : "3"}
                            </div>
                            <p className={`text-sm font-bold ${step3Done ? "text-green-700" : "text-teal-800"}`}>
                              入学誓約書への電子署名
                            </p>
                          </div>
                          {ep.step3Deadline && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${step3Done ? "bg-green-100 text-green-600" : step3Expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {step3Expired ? "期限超過" : `期限：${formatDateOnly(ep.step3Deadline)}`}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          {(!step1Done || !step2Done) && <p className="text-xs text-gray-400 text-center py-2">STEP 1・2を完了してから進んでください</p>}
                          {step1Done && step2Done && (
                            step3Done ? (
                              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                <svg className="w-5 h-5 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                <div>
                                  <p className="text-sm font-medium text-green-700">署名完了</p>
                                  {result.enrollmentSignature && <p className="text-xs text-green-600">{result.enrollmentSignature.signerName} · {formatDate(result.enrollmentSignature.signedAt)}</p>}
                                </div>
                              </div>
                            ) : step3Expired ? expiredBanner("電子署名") : (
                              <>
                                <div className="mb-3">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">署名者氏名（フルネーム）</label>
                                  <input type="text" className="form-input text-sm" placeholder="例：山田 太郎" value={signerName} onChange={(e) => setSignerName(e.target.value)} disabled={signatureSaving} />
                                </div>
                                <SignatureCanvas onSave={handleSignatureSave} disabled={signatureSaving} />
                                {signatureError && <p className="text-xs text-red-500 mt-2">{signatureError}</p>}
                                {signatureSaving && <p className="text-xs text-gray-400 mt-2 text-center">保存中...</p>}
                              </>
                            )
                          )}
                        </div>
                      </div>

                      {/* STEP 4: 完了報告（全ステップ完了後のみ有効） */}
                      <div className={`rounded-xl border-2 overflow-hidden ${!allDone && !enrollSubmitted ? "opacity-50" : enrollSubmitted ? "border-green-300" : "border-gray-300"}`}>
                        <div className={`px-4 py-3 flex items-center justify-between ${enrollSubmitted ? "bg-green-50" : "bg-gray-50"}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${enrollSubmitted ? "bg-green-500 text-white" : allDone ? "bg-navy-700 text-white" : "bg-gray-300 text-white"}`}>
                              {enrollSubmitted ? "✓" : "4"}
                            </div>
                            <p className={`text-sm font-bold ${enrollSubmitted ? "text-green-700" : "text-gray-700"}`}>
                              手続き完了を報告する
                            </p>
                          </div>
                        </div>
                        <div className="p-4">
                          {!allDone && !enrollSubmitted && (
                            <p className="text-xs text-gray-400 text-center py-2">STEP 1〜3をすべて完了してから報告できます</p>
                          )}
                          {(allDone || enrollSubmitted) && (
                            <>
                              {!enrollSubmitted && (
                                <p className="text-xs text-gray-500 mb-3">すべての手続きが完了しました。報告ボタンを押して手続きを締めてください。</p>
                              )}
                              <textarea
                                className="form-input text-sm min-h-[70px] resize-y mb-3"
                                placeholder="例：振込・書類・署名すべて完了しました。"
                                value={studentMemo}
                                onChange={(e) => setStudentMemo(e.target.value)}
                                disabled={enrollSubmitted}
                              />
                              <button
                                onClick={handleEnrollComplete}
                                disabled={enrollSubmitting || enrollSubmitted}
                                className={`btn-primary w-full text-sm ${enrollSubmitted ? "opacity-60 cursor-not-allowed" : ""}`}
                              >
                                {enrollSubmitting ? "送信中..." : enrollSubmitted ? (
                                  <span className="flex items-center justify-center gap-1.5">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                    手続き完了を報告しました
                                  </span>
                                ) : (
                                  <span className="flex items-center justify-center gap-1.5">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    手続き完了を報告する
                                  </span>
                                )}
                              </button>
                              {enrollSubmitted && result.enrollmentProcedure?.completedAt && (
                                <p className="text-xs text-green-600 mt-2 text-center">完了報告日：{formatDate(result.enrollmentProcedure.completedAt)}</p>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </div>
            )}

            {/* 手続き完了後フロー */}
            {(result.status === "合格" || result.status === "補欠合格") &&
              result.enrollmentProcedure && enrollSubmitted && (
              <div className="space-y-4">

              {/* 学校承認待ち / 入学許可書 */}
              {!result.enrollmentProcedure.schoolConfirmed ? (
                <div className="card border-l-4 border-amber-400">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-amber-800">学校確認中</p>
                      <p className="text-xs text-amber-600">手続き内容を確認しています。しばらくお待ちください。</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 bg-amber-50 rounded-lg p-3">
                    確認が完了すると、入学許可書が発行されます。通常2〜5営業日以内にご連絡いたします。
                  </p>
                </div>
              ) : (
                <div className="card border-l-4 border-green-500">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-green-800">入学手続き完了</p>
                      <p className="text-xs text-green-600">学校承認が完了しました。入学許可書を発行しました。</p>
                    </div>
                  </div>
                  <a
                    href={`/api/documents/admission-letter?applicationNo=${result.applicationNo}&email=${encodeURIComponent(email)}&type=admission_permit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-4 py-3 rounded-lg transition-colors w-full"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    入学許可書をダウンロード（PDF）
                  </a>
                </div>
              )}

              {/* 入学式のご案内 */}
              {result.enrollmentProcedure.ceremonyNotified && (
                <div className="card border-l-4 border-blue-500">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-blue-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4a1 1 0 011-1h0a1 1 0 011 1v17M7 5h11l-2.5 3L18 11H7" /></svg>
                    <p className="font-bold text-blue-800">入学式のご案内</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 space-y-2 text-sm">
                    {result.enrollmentProcedure.ceremonyDate && (
                      <div className="flex gap-3">
                        <span className="text-blue-600 font-medium w-12 shrink-0">日時</span>
                        <span className="text-blue-900 font-bold">{formatDateOnly(result.enrollmentProcedure.ceremonyDate)}</span>
                      </div>
                    )}
                    {result.enrollmentProcedure.ceremonyPlace && (
                      <div className="flex gap-3">
                        <span className="text-blue-600 font-medium w-12 shrink-0">会場</span>
                        <span className="text-blue-900">{result.enrollmentProcedure.ceremonyPlace}</span>
                      </div>
                    )}
                    {result.enrollmentProcedure.ceremonyNotes && (
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <p className="text-blue-800 whitespace-pre-line text-xs leading-relaxed">
                          {result.enrollmentProcedure.ceremonyNotes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ビザ更新手続き案内 */}
              {result.enrollmentProcedure.visaGuideNotified && (
                <div className="card border-l-4 border-purple-500">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-purple-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM12 8a2 2 0 100 4 2 2 0 000-4zM9 16h6" /></svg>
                    <p className="font-bold text-purple-800">ビザ・在留資格 更新手続きのご案内</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    {result.enrollmentProcedure.visaGuideNotes ? (
                      <p className="text-purple-900 text-sm whitespace-pre-line leading-relaxed">
                        {result.enrollmentProcedure.visaGuideNotes}
                      </p>
                    ) : (
                      <p className="text-purple-700 text-sm">
                        在留資格の更新・変更手続きについては、入学相談室までご相談ください。<br />
                        （平日9:00〜17:00）
                      </p>
                    )}
                  </div>
                </div>
              )}

            </div>
            )}
          </div>
        )}

        {/* お問い合わせ */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            ご不明な点がございましたら、入学相談室（平日9:00〜17:00）までお問い合わせください。
          </p>
          <Link
            href="/apply"
            className="inline-block mt-4 text-navy-700 hover:text-navy-900 text-sm font-medium underline"
          >
            新規出願はこちら
          </Link>
          <Link
            href="/student"
            className="inline-block mt-2 text-green-700 hover:text-green-900 text-sm font-medium underline"
          >
            在籍学生の方はこちら（学生My Page）
          </Link>
        </div>
          </>
        )}
      </main>

      {/* 基本情報変更申請モーダル */}
      {showChangeModal && result && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="基本情報の変更を申請"
          onClick={() => setShowChangeModal(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowChangeModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-navy-800">基本情報の変更を申請</h3>
              <button
                onClick={() => setShowChangeModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="閉じる"
              >×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {crError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {crError}
                </div>
              )}

              <p className="text-xs text-gray-600 leading-relaxed">
                変更したい項目を選び、新しい値と理由を入力してください。管理者が確認後、承認されると反映されます。
              </p>

              <div>
                <label className="form-label">変更する項目 <span className="form-required">*</span></label>
                <select
                  className="form-input"
                  value={crFieldKey}
                  onChange={(e) => openChangeModal(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {changeFieldDefs.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>

              {crFieldKey && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500">現在の値</p>
                  <p className="text-sm font-medium text-gray-700 break-words">
                    {(() => {
                      const v = (result as unknown as Record<string, unknown>)[crFieldKey];
                      return v == null || v === "" ? <span className="text-gray-400">(未設定)</span> : String(v);
                    })()}
                  </p>
                </div>
              )}

              {crFieldKey && currentFieldDef && (
                <div>
                  <label className="form-label">新しい値 <span className="form-required">*</span></label>
                  {currentFieldDef.type === "select" && currentFieldDef.options ? (
                    <select className="form-input" value={crNewValue} onChange={(e) => setCrNewValue(e.target.value)}>
                      <option value="">選択してください</option>
                      {currentFieldDef.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={currentFieldDef.type === "tel" ? "tel" : currentFieldDef.type === "email" ? "email" : currentFieldDef.type === "date" ? "date" : "text"}
                      className="form-input"
                      value={crNewValue}
                      onChange={(e) => setCrNewValue(e.target.value)}
                      placeholder={currentFieldDef.label}
                    />
                  )}
                </div>
              )}

              {crFieldKey && (
                <div>
                  <label className="form-label">変更理由（任意）</label>
                  <textarea
                    className="form-input min-h-[80px]"
                    placeholder="例：転居のため住所を変更したい"
                    value={crReason}
                    onChange={(e) => setCrReason(e.target.value)}
                    maxLength={500}
                  />
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-bold mb-0.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.01M10.34 4.66l-7.1 12.3A1.5 1.5 0 004.55 19.5h14.9a1.5 1.5 0 001.31-2.54l-7.1-12.3a1.5 1.5 0 00-2.62 0z" /></svg>
                  注意事項
                </p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>管理者の承認後に反映されます（即時には変わりません）</li>
                  <li>同じ項目を複数同時に申請することはできません</li>
                  <li>志望校・学科の変更は本機能では受け付けていません</li>
                </ul>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowChangeModal(false)}
                disabled={crSubmitting}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >キャンセル</button>
              <button
                onClick={submitChangeRequest}
                disabled={crSubmitting || !crFieldKey || !crNewValue.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg"
              >{crSubmitting ? "送信中..." : "変更を申請する"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-navy-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <StatusPageInner />
    </Suspense>
  );
}
