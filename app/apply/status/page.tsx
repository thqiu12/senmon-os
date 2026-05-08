"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getStatusStyle } from "@/lib/utils";

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
  }[];
  interviewDate: string | null;
  interviewTime: string | null;
  interviewPlace: string | null;
  interviewNotes: string | null;
  enrollmentProcedure: EnrollmentProcedure | null;
  enrollmentSignature: EnrollmentSignature | null;
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
      <p className="text-3xl mb-2">🎓</p>
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
          { key: "attendance", label: "📅 出席" },
          { key: "timetable", label: "📋 時間割" },
          { key: "leave", label: "📝 欠席届" },
          { key: "cert", label: "📜 証明書" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${tab === t.key ? "bg-white shadow text-navy-800" : "text-gray-500"}`}>
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
  const searchParams = useSearchParams();
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

  // URLパラメータから自動ロード
  const fetchStatus = useCallback(async (appNo: string, emailAddr: string) => {
    setAutoLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ applicationNo: appNo, email: emailAddr });
      const res = await fetch(`/api/applications/status?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "確認に失敗しました");
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
      }
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setAutoLoading(false);
    }
  }, []);

  useEffect(() => {
    const appNo = searchParams.get("applicationNo");
    const emailAddr = searchParams.get("email");
    if (appNo && emailAddr) {
      setApplicationNo(appNo);
      setEmail(emailAddr);
      fetchStatus(appNo, emailAddr);
    }
  }, [searchParams, fetchStatus]);

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
      }
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const handleFileUpload = async (docType: string, file: File) => {
    if (!result) return;
    setUploadingDocType(docType);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("applicationId", result.id);
      formData.append("docType", docType);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setUploadedDocs((prev) => ({ ...prev, [docType]: true }));
        // ドキュメントリストを更新
        const data = await res.json();
        setResult((prev) =>
          prev
            ? {
                ...prev,
                documents: [
                  ...prev.documents,
                  {
                    id: data.document.id,
                    docType: data.document.docType,
                    fileName: data.document.fileName,
                    originalName: data.document.originalName,
                    uploadedAt: new Date().toISOString(),
                  },
                ],
              }
            : null
        );
      } else {
        const err = await res.json();
        alert(err.error || "アップロードに失敗しました");
      }
    } catch {
      alert("ネットワークエラーが発生しました");
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
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="animate-spin w-10 h-10 text-navy-600 mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-500">読み込み中...</p>
          </div>
        )}

        {!autoLoading && (
          <>
            {/* 合格後：手続き促進バナー（結果表示前 & 手続き未完了） */}
            {result && (result.status === "合格" || result.status === "補欠合格") &&
              result.enrollmentProcedure && result.enrollmentProcedure.status !== "完了" && (
              <div className="mb-6 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 text-white p-5 shadow-md">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">🏫</span>
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
                    申請番号と登録したメールアドレスで現在の審査状況をご確認いただけます。
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
                  onClick={() => { setResult(null); setError(null); }}
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
                <span className={`status-badge text-sm px-3 py-1 ${getStatusStyle(result.status)}`}>
                  {result.status}
                </span>
              </div>

              {/* 合格カード */}
              {result.status === "合格" && (
                <div className="rounded-xl p-5 mb-6 bg-green-50 border-2 border-green-400 text-center">
                  <p className="text-3xl mb-2">🎉</p>
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
                    <span className="text-2xl">📋</span>
                    <p className="text-orange-800 text-lg font-bold">補欠合格のご通知</p>
                  </div>
                  <p className="text-orange-700 text-sm leading-relaxed mb-3">
                    審査の結果、あなたの実力は<strong>合格基準を十分に満たしています</strong>。<br />
                    ただし、今回は定員の関係により、補欠合格という形でのご通知となりました。
                  </p>
                  <div className="bg-orange-100 rounded-lg p-3 text-sm text-orange-800">
                    <p className="font-semibold mb-1">📌 今後の流れについて</p>
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

              {/* その他ステータス説明 */}
              {result.status !== "合格" && result.status !== "補欠合格" && result.status !== "不合格" && (
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
              )}

              {/* 進捗バー */}
              {result.status !== "不合格" && result.status !== "保留" && result.status !== "補欠合格" && (
                <div className="mb-6">
                  <p className="text-xs text-gray-500 mb-4 font-semibold uppercase tracking-wide">
                    審査の進捗
                  </p>
                  <div className="relative">
                    <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200" />
                    <div
                      className="absolute top-4 left-4 h-0.5 bg-navy-700 transition-all duration-500"
                      style={{
                        width:
                          progressIndex <= 0
                            ? "0%"
                            : `${(progressIndex / (PROGRESS_STEPS.length - 1)) * 100}%`,
                      }}
                    />
                    <div className="relative flex justify-between">
                      {PROGRESS_STEPS.map((step, i) => {
                        const isCompleted = i < progressIndex;
                        const isCurrent = i === progressIndex;
                        return (
                          <div key={step.key} className="flex flex-col items-center" style={{ width: `${100 / PROGRESS_STEPS.length}%` }}>
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 z-10 ${
                                isCompleted
                                  ? "bg-navy-800 border-navy-800 text-white"
                                  : isCurrent
                                  ? "bg-white border-navy-800 text-navy-800"
                                  : "bg-white border-gray-300 text-gray-400"
                              }`}
                            >
                              {isCompleted ? (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                i + 1
                              )}
                            </div>
                            <span
                              className={`text-xs mt-1 text-center leading-tight ${
                                isCurrent ? "text-navy-800 font-bold" : isCompleted ? "text-navy-600" : "text-gray-400"
                              }`}
                              style={{ fontSize: "10px" }}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 申請者情報 */}
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

              {/* 提出書類 */}
              {result.documents.filter(d => !d.docType.startsWith("入学手続き_")).length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    提出書類（{result.documents.filter(d => !d.docType.startsWith("入学手続き_")).length}件）
                  </p>
                  <div className="space-y-1">
                    {result.documents.filter(d => !d.docType.startsWith("入学手続き_")).map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>{doc.docType}</span>
                        <span className="text-gray-400">— {doc.originalName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  最終更新：{formatDate(result.updatedAt)}
                </p>
              </div>
            </div>

            {/* 面接詳細カード */}
            {result.status === "面接待ち" && result.interviewDate && (
              <div className="card border-l-4 border-blue-500">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-blue-900">面接のご案内</h3>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <p className="text-xs text-blue-600 font-medium mb-0.5">日付</p>
                      <p className="text-blue-900 font-semibold">{formatDateOnly(result.interviewDate)}</p>
                    </div>
                    {result.interviewTime && (
                      <div className="flex-1">
                        <p className="text-xs text-blue-600 font-medium mb-0.5">時間</p>
                        <p className="text-blue-900 font-semibold">{result.interviewTime}</p>
                      </div>
                    )}
                  </div>
                  {result.interviewPlace && (
                    <div>
                      <p className="text-xs text-blue-600 font-medium mb-0.5">場所</p>
                      <p className="text-blue-900">{result.interviewPlace}</p>
                    </div>
                  )}
                  {result.interviewNotes && (
                    <div>
                      <p className="text-xs text-blue-600 font-medium mb-0.5">注意事項</p>
                      <p className="text-blue-800 text-sm whitespace-pre-line">{result.interviewNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

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
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${step1Done ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-700"}`}>
                              期限：{formatDateOnly(ep.step1Deadline)}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          {/* 振込先 */}
                          {ep.tuitionBankInfo && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                              <p className="text-xs font-bold text-blue-800 mb-1">💳 振込先情報</p>
                              <p className="text-xs text-blue-900 whitespace-pre-line font-mono leading-relaxed">{ep.tuitionBankInfo}</p>
                            </div>
                          )}
                          {/* 金額 */}
                          <div className={`rounded-lg p-3 mb-3 ${ep.tuitionPlan === "分割（2期）" ? "bg-purple-50 border border-purple-200" : "bg-gray-50 border border-gray-200"}`}>
                            <p className="text-xs font-bold text-gray-700 mb-2">
                              {ep.tuitionPlan === "分割（2期）" ? "💴 分割払い（2期）" : "💴 全額一括払い"}
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
                            {(() => {
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
                                  <label className={`shrink-0 cursor-pointer text-xs px-3 py-1.5 rounded-lg border transition-colors ${isUploading ? "opacity-50 bg-gray-100 border-gray-200 text-gray-400" : isUploaded ? "bg-white border-gray-300 text-gray-500" : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"}`}>
                                    {isUploading ? "送信中..." : isUploaded ? "再アップロード" : "ファイルを選択"}
                                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" disabled={isUploading}
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
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${step2Done ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-700"}`}>
                              期限：{formatDateOnly(ep.step2Deadline)}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          {!step1Done && <p className="text-xs text-gray-400 text-center py-2">STEP 1（学費納入）を完了してから進んでください</p>}
                          {step1Done && (
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
                                      {item.required && !isUploaded && <span className="ml-1.5 text-xs text-red-400">必須</span>}
                                    </div>
                                    <label className={`shrink-0 cursor-pointer text-xs px-2.5 py-1.5 rounded-lg border ${isUploading ? "opacity-50 bg-gray-100 border-gray-200 text-gray-400" : isUploaded ? "bg-white border-gray-300 text-gray-500" : "bg-purple-600 border-purple-600 text-white hover:bg-purple-700"}`}>
                                      {isUploading ? "送信中..." : isUploaded ? "再UP" : "選択"}
                                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" disabled={isUploading}
                                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(docKey, f); e.target.value = ""; }} />
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          )}
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
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${step3Done ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-700"}`}>
                              期限：{formatDateOnly(ep.step3Deadline)}
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
                            ) : (
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
                                ) : "✅ 手続き完了を報告する"}
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
                      <p className="font-bold text-green-800">入学手続き完了 ✅</p>
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
                    <span className="text-xl">🎌</span>
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
                    <span className="text-xl">🛂</span>
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
            🎓 在籍学生の方はこちら（学生My Page）
          </Link>
        </div>
          </>
        )}
      </main>
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
