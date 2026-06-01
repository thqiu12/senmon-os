"use client";

import { useState, useEffect, useCallback, Suspense } from "react";

import Link from "next/link";

// ===== 型定義 =====
interface TimetableSlot {
  dayOfWeek: number; period: number; startTime: string; endTime: string;
  room: string | null;
  subject: { name: string };
  teacher: { name: string } | null;
}
interface AttendanceRecord { date: string; status: string; subject: { name: string }; }
interface LeaveRequest { id: string; type: string; startDate: string; endDate: string; reason: string; status: string; }
interface CertRequest { id: string; type: string; copies: number; purpose: string | null; status: string; createdAt: string; issuedAt: string | null; }
interface HomeworkSub {
  id: string; status: string; score: number | null; feedback: string | null; submittedAt: string | null;
  homework: { title: string; dueDate: string; maxScore: number; subject: { name: string }; };
}
interface CalendarEvent { id: string; title: string; eventDate: string; endDate: string | null; category: string; description: string | null; }
interface SchoolNotice { id: string; title: string; content: string; category: string; isPinned: boolean; publishedAt: string; createdBy: string; }
interface ChatMessage { id: string; senderType: string; senderName: string; message: string; isRead: boolean; createdAt: string; }
interface PortalData {
  enrolled: boolean;
  student?: {
    id: string; studentNo: string; lastName: string; firstName: string; lastNameKana: string | null;
    status: string; enrolledAt: string;
    school: { id: string; name: string };
    class: { name: string; course: { name: string } } | null;
  };
  timetable?: TimetableSlot[];
  attendanceRate?: number | null;
  attendanceSummary?: { total: number; present: number; late: number; absent: number; publicLeave: number; };
  recentAttendances?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  certRequests?: CertRequest[];
  homeworkSubs?: HomeworkSub[];
  chatMessages?: ChatMessage[];
}

// ===== 定数 =====
const DAY_LABELS = ["", "月", "火", "水", "木", "金", "土"];
const CERT_TYPES = ["在籍証明書", "出席率証明書", "成績証明書", "卒業見込証明書"];
const ATT_COLORS: Record<string, string> = {
  出席: "bg-green-100 text-green-700", 欠席: "bg-red-100 text-red-700",
  遅刻: "bg-yellow-100 text-yellow-700", 早退: "bg-orange-100 text-orange-700",
  公欠: "bg-blue-100 text-blue-700",
};

// ===== ログイン画面 =====
function LoginForm({ onLogin }: { onLogin: (studentNo: string, email: string) => void }) {
  const [studentNo, setStudentNo] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentNo.trim() || !email.trim()) { setError("学籍番号とメールアドレスを入力してください"); return; }
    setLoading(true); setError(null);
    // 学籍番号からapplicationNoを逆引き
    try {
      const res = await fetch(`/api/student-portal?studentNo=${encodeURIComponent(studentNo)}&email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!data.enrolled) { setError("学籍番号またはメールアドレスが正しくありません"); }
      else { onLogin(studentNo, email); }
    } catch { setError("接続エラーが発生しました"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-navy-800 font-bold text-2xl">学</span>
          </div>
          <h1 className="text-white text-2xl font-bold">学生ポータル</h1>
          <p className="text-navy-300 text-sm mt-1">在籍学生専用マイページ</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">学籍番号</label>
              <input type="text" className="form-input" placeholder="例: HABA26-0001"
                value={studentNo} onChange={e => { setStudentNo(e.target.value); setError(null); }} autoFocus />
            </div>
            <div>
              <label className="form-label">メールアドレス</label>
              <input type="email" className="form-input" placeholder="登録メールアドレス"
                value={email} onChange={e => { setEmail(e.target.value); setError(null); }} />
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? "確認中..." : "ログイン"}
            </button>
          </form>
          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <Link href="/apply/status" className="text-sm text-navy-600 hover:underline">
              出願状況の確認はこちら →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== メインMyPageコンテンツ =====
function MyPageContent({ studentNo, email, onLogout }: { studentNo: string; email: string; onLogout: () => void }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"home" | "attendance" | "timetable" | "homework" | "leave" | "cert" | "calendar" | "notices" | "chat">("home");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // 欠席届フォーム
  const [leaveForm, setLeaveForm] = useState(false);
  const [leaveType, setLeaveType] = useState("欠席届");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveFile, setLeaveFile] = useState<File | null>(null);

  // 証明書申請フォーム
  const [certForm, setCertForm] = useState(false);
  const [certType, setCertType] = useState("在籍証明書");
  const [certPurpose, setCertPurpose] = useState("");
  const [certCopies, setCertCopies] = useState(1);

  const [submitting, setSubmitting] = useState(false);

  // チャット
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);

  // カレンダー・掲示板
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [notices, setNotices] = useState<SchoolNotice[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [expandedNotice, setExpandedNotice] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({ studentNo, email });
    const res = await fetch(`/api/student-portal?${params}`);
    const d = await res.json();
    setData(d);
    if (d.chatMessages) setChatMessages(d.chatMessages);
    setLoading(false);
  }, [studentNo, email]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // カレンダー取得
  useEffect(() => {
    if (!data?.student) return;
    const schoolId = data.student.school.id;
    fetch(`/api/student-portal/calendar?schoolId=${schoolId}&month=${calendarMonth}`)
      .then(r => r.json()).then(d => Array.isArray(d) && setCalendarEvents(d));
  }, [data, calendarMonth]);

  // 掲示板取得
  useEffect(() => {
    if (!data?.student) return;
    const schoolId = data.student.school.id;
    fetch(`/api/student-portal/notices?schoolId=${schoolId}`)
      .then(r => r.json()).then(d => Array.isArray(d) && setNotices(d));
  }, [data]);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || !data?.student?.id) return;
    setChatSending(true);
    try {
      const res = await fetch("/api/student-portal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentNo, email, message: chatInput }),
      });
      if (res.ok) {
        const newMsg = await res.json();
        setChatMessages(prev => [...prev, newMsg]);
        setChatInput("");
      }
    } finally { setChatSending(false); }
  };

  const handleLeaveSubmit = async () => {
    if (!leaveStart || !leaveEnd || !leaveReason) { showMsg("全項目を入力してください", "error"); return; }
    setSubmitting(true);
    let proofFilePath = null;
    // 証明書ファイルがあればアップロード
    if (leaveFile) {
      const fd = new FormData();
      fd.append("file", leaveFile);
      fd.append("studentNo", studentNo);
      fd.append("email", email);
      fd.append("docType", "欠席証明書");
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await upRes.json();
      if (upData.document) proofFilePath = upData.document.filePath;
    }
    const res = await fetch("/api/student-portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentNo, email, action: "leave_request", type: leaveType, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason, proofFilePath }),
    });
    const d = await res.json();
    if (d.success) {
      showMsg("欠席届を提出しました");
      setLeaveForm(false); setLeaveStart(""); setLeaveEnd(""); setLeaveReason(""); setLeaveFile(null);
      fetchData();
    } else { showMsg(d.error || "提出に失敗しました", "error"); }
    setSubmitting(false);
  };

  const handleCertSubmit = async () => {
    setSubmitting(true);
    const res = await fetch("/api/student-portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentNo, email, action: "cert_request", type: certType, purpose: certPurpose, copies: certCopies }),
    });
    const d = await res.json();
    if (d.success) {
      showMsg("証明書申請を受け付けました");
      setCertForm(false); setCertPurpose(""); setCertCopies(1);
      fetchData();
    } else { showMsg(d.error || "申請に失敗しました", "error"); }
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <svg className="animate-spin w-8 h-8 text-navy-600" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );

  if (!data?.enrolled) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-400 mb-4">在籍情報が見つかりません</p>
        <button onClick={onLogout} className="text-sm text-navy-600 hover:underline">ログアウト</button>
      </div>
    </div>
  );

  const s = data.student!;
  const rate = data.attendanceRate;
  const summary = data.attendanceSummary;

  const rateColor = rate === null || rate === undefined ? "text-gray-400" :
    rate >= 80 ? "text-green-600" : rate >= 70 ? "text-yellow-600" : "text-red-600";
  const rateBg = rate === null || rate === undefined ? "bg-gray-50" :
    rate >= 80 ? "bg-green-50" : rate >= 70 ? "bg-yellow-50" : "bg-red-50";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-navy-800 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white text-navy-800 flex items-center justify-center font-bold text-sm">
              {s.lastName.slice(0, 1)}
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">{s.lastName} {s.firstName}</p>
              <p className="text-navy-300 text-xs">{s.studentNo}</p>
            </div>
          </div>
          <button onClick={onLogout} className="text-navy-300 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-navy-600 hover:border-navy-400 transition-colors">
            ログアウト
          </button>
        </div>
      </header>

      {/* メッセージバナー */}
      {msg && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-sm font-medium ${msg.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
          {msg.type === "success" ? "✅ " : "❌ "}{msg.text}
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-5">
        {/* ナビゲーション */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { key: "home",       label: "ホーム",    sym: "⌂" },
            { key: "timetable",  label: "時間割",    sym: "≡" },
            { key: "attendance", label: "出席",      sym: "✓" },
            { key: "homework",   label: "課題",      sym: "✎" },
            { key: "leave",      label: "欠席届",    sym: "⚑" },
            { key: "cert",       label: "証明書",    sym: "◈" },
            { key: "calendar",   label: "年間行事",  sym: "▦" },
            { key: "notices",    label: "掲示板",    sym: "◉" },
            { key: "chat",       label: "先生に相談", sym: "✉" },
          ].map(({ key, sym, label }) => (
            <button key={key} onClick={() => setTab(key as typeof tab)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-semibold transition-colors border-2 ${tab === key ? "bg-navy-800 text-white border-navy-800" : "bg-white text-gray-600 border-gray-200 hover:border-navy-300"}`}>
              <span className="text-lg leading-none">{sym}</span>
              {label}
            </button>
          ))}
        </div>

        {/* ===== ホーム ===== */}
        {tab === "home" && (
          <div className="space-y-4">
            {/* 学籍情報 */}
            <div className="card">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-navy-800 text-white flex items-center justify-center text-2xl font-bold shrink-0">
                  {s.lastName.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-bold text-gray-900">{s.lastName} {s.firstName}</p>
                  <p className="text-sm text-gray-500">{s.lastNameKana}</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p><span className="text-gray-400">学校：</span>{s.school.name}</p>
                    <p><span className="text-gray-400">コース：</span>{s.class?.course.name || "—"}</p>
                    <p><span className="text-gray-400">クラス：</span>{s.class?.name || "—"}</p>
                    <p><span className="text-gray-400">入学：</span>{new Date(s.enrolledAt).toLocaleDateString("ja-JP")}</p>
                  </div>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold shrink-0">{s.status}</span>
              </div>
            </div>

            {/* 出席率 */}
            <div className={`card ${rateBg}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-700">■ 出席率（直近3ヶ月）</p>
                <button onClick={() => setTab("attendance")} className="text-xs text-navy-600 hover:underline">詳細 →</button>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className={`text-4xl font-bold ${rateColor}`}>{rate ?? "—"}{rate !== null && rate !== undefined ? "%" : ""}</p>
                  <p className="text-xs text-gray-500 mt-1">{summary ? `${summary.present + summary.late} / ${summary.total} コマ` : ""}</p>
                </div>
                {summary && (
                  <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                      <div className={`h-3 rounded-full ${rate !== null && rate !== undefined && rate >= 80 ? "bg-green-500" : rate !== null && rate !== undefined && rate >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${rate ?? 0}%` }} />
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-center text-xs">
                      <div><span className="text-green-600 font-bold">{summary.present}</span><br /><span className="text-gray-400">出席</span></div>
                      <div><span className="text-red-600 font-bold">{summary.absent}</span><br /><span className="text-gray-400">欠席</span></div>
                      <div><span className="text-yellow-600 font-bold">{summary.late}</span><br /><span className="text-gray-400">遅刻</span></div>
                      <div><span className="text-blue-600 font-bold">{summary.publicLeave}</span><br /><span className="text-gray-400">公欠</span></div>
                    </div>
                  </div>
                )}
              </div>
              {rate !== null && rate !== undefined && rate < 80 && (
                <div className="mt-3 p-2.5 bg-red-100 rounded-lg text-xs text-red-700 font-medium">
                  ! 出席率が80%を下回っています。担任の先生に相談してください。
                </div>
              )}
            </div>

            {/* 課題期限 */}
            {(data.homeworkSubs || []).filter(h => h.status === "未提出").length > 0 && (
              <div className="card border-2 border-orange-200 bg-orange-50">
                <p className="text-sm font-bold text-orange-800 mb-2">! 未提出の課題</p>
                {(data.homeworkSubs || []).filter(h => h.status === "未提出").slice(0, 3).map(h => (
                  <div key={h.id} className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-gray-700">{h.homework.subject.name} · {h.homework.title}</span>
                    <span className="text-xs text-orange-700 font-medium">期限: {h.homework.dueDate}</span>
                  </div>
                ))}
                <button onClick={() => setTab("homework")} className="text-xs text-orange-700 font-semibold mt-2 hover:underline">全て確認 →</button>
              </div>
            )}

            {/* 申請中 */}
            {((data.leaveRequests || []).filter(r => r.status === "申請中").length > 0 ||
              (data.certRequests || []).filter(r => r.status === "申請中" || r.status === "作成中").length > 0) && (
              <div className="card">
                <p className="text-sm font-bold text-navy-700 mb-2">■ 申請状況</p>
                {(data.leaveRequests || []).filter(r => r.status === "申請中").map(r => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-gray-700">{r.type} ({r.startDate}〜{r.endDate})</span>
                    <span className="text-yellow-600 font-medium">確認中</span>
                  </div>
                ))}
                {(data.certRequests || []).filter(r => ["申請中","作成中"].includes(r.status)).map(r => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-gray-700">{r.type}</span>
                    <span className="text-blue-600 font-medium">{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 時間割 ===== */}
        {tab === "timetable" && (
          <div className="card overflow-x-auto p-0">
            {(!data.timetable || data.timetable.length === 0) ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">≡</p>
                <p>時間割が登録されていません</p>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-navy-800 text-white">
                    <th className="px-2 py-3 text-center w-10 font-semibold">時限</th>
                    {[1,2,3,4,5].map(d => (
                      <th key={d} className="px-2 py-3 text-center font-semibold">{DAY_LABELS[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1,2,3,4,5,6].map(period => (
                    <tr key={period} className={`border-b border-gray-100 ${period % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
                      <td className="px-2 py-3 text-center font-bold text-gray-500 text-sm">{period}</td>
                      {[1,2,3,4,5].map(day => {
                        const slot = data.timetable?.find(s => s.dayOfWeek === day && s.period === period);
                        return (
                          <td key={day} className="px-2 py-2 text-center min-w-[70px] border-l border-gray-100">
                            {slot ? (
                              <div className="bg-navy-50 rounded-lg p-1.5">
                                <p className="font-semibold text-navy-800 text-xs leading-tight">{slot.subject.name}</p>
                                {slot.teacher && <p className="text-gray-500 text-xs mt-0.5">{slot.teacher.name}</p>}
                                {slot.room && <p className="text-gray-400 text-xs">{slot.room}</p>}
                              </div>
                            ) : <span className="text-gray-200">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ===== 出席 ===== */}
        {tab === "attendance" && (
          <div className="space-y-3">
            {(data.recentAttendances || []).length === 0 ? (
              <div className="card text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">✓</p><p>出席記録がありません</p>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <div className="px-4 py-3 bg-navy-800 text-white flex items-center justify-between">
                  <p className="font-semibold text-sm">直近の出席履歴</p>
                  <p className={`text-lg font-bold ${rateColor.replace("text-", "text-")} bg-white px-3 py-0.5 rounded-full`}
                    style={{ color: rate !== null && rate !== undefined && rate >= 80 ? "#16a34a" : rate !== null && rate !== undefined && rate >= 70 ? "#ca8a04" : "#dc2626" }}>
                    {rate ?? "—"}{rate !== null && rate !== undefined ? "%" : ""}
                  </p>
                </div>
                <div className="divide-y divide-gray-100">
                  {(data.recentAttendances || []).map((a, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-20 shrink-0">{a.date}</span>
                        <span className="text-sm text-gray-700">{a.subject.name}</span>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ATT_COLORS[a.status] || "bg-gray-100 text-gray-600"}`}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== 課題 ===== */}
        {tab === "homework" && (
          <div className="space-y-3">
            {(data.homeworkSubs || []).length === 0 ? (
              <div className="card text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">✎</p><p>課題がありません</p>
              </div>
            ) : (data.homeworkSubs || []).map(sub => (
              <div key={sub.id} className="card p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{sub.homework.title}</p>
                    <p className="text-xs text-gray-500">{sub.homework.subject.name} · 期限: {sub.homework.dueDate}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${sub.status === "採点済" || sub.status === "返却済" ? "bg-green-100 text-green-700" : sub.status === "提出済" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                    {sub.status}
                  </span>
                </div>
                {(sub.score !== null || sub.feedback) && (
                  <div className="px-4 py-3">
                    {sub.score !== null && (
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl font-bold text-navy-800">{sub.score}</span>
                        <span className="text-gray-400">/ {sub.homework.maxScore}点</span>
                        <span className={`text-sm font-bold ${sub.score / sub.homework.maxScore >= 0.7 ? "text-green-600" : "text-red-600"}`}>
                          ({Math.round((sub.score / sub.homework.maxScore) * 100)}%)
                        </span>
                      </div>
                    )}
                    {sub.feedback && (
                      <div className="bg-blue-50 rounded-lg p-3 text-sm text-gray-700">
                        <p className="text-xs font-semibold text-blue-700 mb-1">▶ 先生のコメント</p>
                        {sub.feedback}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ===== 欠席届 ===== */}
        {tab === "leave" && (
          <div className="space-y-4">
            <button onClick={() => setLeaveForm(!leaveForm)}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${leaveForm ? "bg-gray-200 text-gray-600" : "btn-primary"}`}>
              {leaveForm ? "キャンセル" : "＋ 欠席届を提出する"}
            </button>

            {leaveForm && (
              <div className="card border-2 border-navy-200 bg-navy-50">
                <p className="text-sm font-bold text-navy-800 mb-3">欠席届を提出</p>
                <div className="space-y-3">
                  <div>
                    <label className="form-label text-xs">種別</label>
                    <select className="form-input" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                      {["欠席届", "遅刻届", "早退届"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-xs">開始日</label>
                      <input type="date" className="form-input" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label text-xs">終了日</label>
                      <input type="date" className="form-input" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label text-xs">理由</label>
                    <textarea className="form-input min-h-[80px]" placeholder="欠席・遅刻の理由"
                      value={leaveReason} onChange={e => setLeaveReason(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">証明書・診断書（任意）</label>
                    <input type="file" className="form-input text-sm" accept="image/*,.pdf"
                      onChange={e => setLeaveFile(e.target.files?.[0] || null)} />
                  </div>
                  <button onClick={handleLeaveSubmit} disabled={submitting}
                    className="w-full btn-primary disabled:opacity-50">
                    {submitting ? "送信中..." : "提出する"}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(data.leaveRequests || []).length === 0 ? (
                <div className="card text-center py-8 text-gray-400"><p>提出した欠席届はありません</p></div>
              ) : (data.leaveRequests || []).map(r => (
                <div key={r.id} className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{r.type}</p>
                      <p className="text-xs text-gray-500">{r.startDate} 〜 {r.endDate}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${r.status === "承認" ? "bg-green-100 text-green-700" : r.status === "却下" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 text-xs text-gray-600">{r.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== 証明書申請 ===== */}
        {tab === "cert" && (
          <div className="space-y-4">
            <button onClick={() => setCertForm(!certForm)}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${certForm ? "bg-gray-200 text-gray-600" : "btn-primary"}`}>
              {certForm ? "キャンセル" : "＋ 証明書を申請する"}
            </button>

            {certForm && (
              <div className="card border-2 border-navy-200 bg-navy-50">
                <p className="text-sm font-bold text-navy-800 mb-3">証明書を申請</p>
                <div className="space-y-3">
                  <div>
                    <label className="form-label text-xs">証明書の種類</label>
                    <div className="grid grid-cols-2 gap-2">
                      {CERT_TYPES.map(t => (
                        <label key={t} className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-colors ${certType === t ? "border-navy-500 bg-navy-50" : "border-gray-200 bg-white"}`}>
                          <input type="radio" name="certType" value={t} checked={certType === t} onChange={() => setCertType(t)} className="hidden" />
                          <span className="text-xs font-medium text-gray-700">{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-xs">通数</label>
                      <input type="number" min={1} max={10} className="form-input" value={certCopies} onChange={e => setCertCopies(parseInt(e.target.value) || 1)} />
                    </div>
                    <div>
                      <label className="form-label text-xs">使用目的（任意）</label>
                      <input type="text" className="form-input" placeholder="例: ビザ申請" value={certPurpose} onChange={e => setCertPurpose(e.target.value)} />
                    </div>
                  </div>
                  <button onClick={handleCertSubmit} disabled={submitting}
                    className="w-full btn-primary disabled:opacity-50">
                    {submitting ? "申請中..." : "申請する"}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(data.certRequests || []).length === 0 ? (
                <div className="card text-center py-8 text-gray-400"><p>申請した証明書はありません</p></div>
              ) : (data.certRequests || []).map(r => (
                <div key={r.id} className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{r.type}</p>
                      <p className="text-xs text-gray-500">{r.copies}通{r.purpose ? ` · ${r.purpose}` : ""} · {new Date(r.createdAt).toLocaleDateString("ja-JP")}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${r.status === "発行済" ? "bg-green-100 text-green-700" : r.status === "却下" ? "bg-red-100 text-red-700" : r.status === "承認済" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {r.status}
                    </span>
                  </div>
                  {r.issuedAt && (
                    <div className="px-4 py-2 text-xs text-green-600">
                      発行日: {new Date(r.issuedAt).toLocaleDateString("ja-JP")} — 学校窓口で受け取ってください
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ===== 年間カレンダー ===== */}
        {tab === "calendar" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-navy-800 text-base">■ 年間行事カレンダー</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const d = new Date(calendarMonth + "-01");
                  d.setMonth(d.getMonth() - 1);
                  setCalendarMonth(d.toISOString().slice(0, 7));
                }} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">◀</button>
                <span className="text-sm font-semibold">{calendarMonth.replace("-", "年")}月</span>
                <button onClick={() => {
                  const d = new Date(calendarMonth + "-01");
                  d.setMonth(d.getMonth() + 1);
                  setCalendarMonth(d.toISOString().slice(0, 7));
                }} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">▶</button>
              </div>
            </div>
            {calendarEvents.length === 0 ? (
              <p className="text-center text-gray-400 py-8">この月の行事はありません</p>
            ) : (
              calendarEvents.map(ev => {
                const catColor: Record<string, string> = {
                  休日: "bg-red-100 text-red-700",
                  試験: "bg-purple-100 text-purple-700",
                  行事: "bg-blue-100 text-blue-700",
                  締切: "bg-orange-100 text-orange-700",
                  一般: "bg-gray-100 text-gray-600",
                };
                return (
                  <div key={ev.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
                    <div className="text-center min-w-[48px]">
                      <p className="text-xs text-gray-400">{new Date(ev.eventDate).toLocaleDateString("ja-JP", { month: "short" })}</p>
                      <p className="text-2xl font-bold text-navy-800">{new Date(ev.eventDate).getDate()}</p>
                      <p className="text-xs text-gray-400">{["日","月","火","水","木","金","土"][new Date(ev.eventDate).getDay()]}</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColor[ev.category] || catColor["一般"]}`}>{ev.category}</span>
                        {ev.endDate && ev.endDate !== ev.eventDate && (
                          <span className="text-xs text-gray-400">〜 {new Date(ev.endDate).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}</span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-800 text-sm">{ev.title}</p>
                      {ev.description && <p className="text-xs text-gray-500 mt-1">{ev.description}</p>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ===== 学校掲示板 ===== */}
        {tab === "notices" && (
          <div className="space-y-3">
            <h2 className="font-bold text-navy-800 text-base">■ 学校からのお知らせ</h2>
            {notices.length === 0 ? (
              <p className="text-center text-gray-400 py-8">お知らせはありません</p>
            ) : (
              notices.map(n => {
                const catColor: Record<string, string> = {
                  重要: "bg-red-100 text-red-700",
                  緊急: "bg-red-500 text-white",
                  イベント: "bg-blue-100 text-blue-700",
                  一般: "bg-gray-100 text-gray-600",
                };
                return (
                  <div key={n.id} className={`bg-white rounded-xl border-2 overflow-hidden ${n.isPinned ? "border-red-300" : "border-gray-200"}`}>
                    <button className="w-full text-left px-4 py-3" onClick={() => setExpandedNotice(expandedNotice === n.id ? null : n.id)}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {n.isPinned && <span className="text-xs">📌</span>}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColor[n.category] || catColor["一般"]}`}>{n.category}</span>
                            <span className="text-xs text-gray-400">{new Date(n.publishedAt).toLocaleDateString("ja-JP")} · {n.createdBy}</span>
                          </div>
                          <p className="font-semibold text-gray-800 text-sm">{n.title}</p>
                        </div>
                        <span className="text-gray-400 text-xs mt-1">{expandedNotice === n.id ? "▲" : "▼"}</span>
                      </div>
                    </button>
                    {expandedNotice === n.id && (
                      <div className="px-4 pb-4 text-sm text-gray-700 border-t border-gray-100 pt-3 whitespace-pre-wrap">
                        {n.content}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ===== 先生へのチャット ===== */}
        {tab === "chat" && (
          <div className="flex flex-col h-[70vh]">
            <h2 className="font-bold text-navy-800 text-base mb-3">■ 担任の先生に相談</h2>
            <p className="text-xs text-gray-500 mb-3 bg-blue-50 rounded-lg px-3 py-2">
              担任の先生に気軽にメッセージを送れます。返信は授業時間外（平日 16:00〜18:00）に行われます。
            </p>
            <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200 p-4 space-y-3 mb-3">
              {chatMessages.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">まだメッセージはありません</p>
              )}
              {chatMessages.map(m => (
                <div key={m.id} className={`flex ${m.senderType === "student" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.senderType === "student" ? "bg-navy-800 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}>
                    {m.senderType === "teacher" && (
                      <p className="text-xs font-semibold mb-1 text-navy-600">{m.senderName}</p>
                    )}
                    <p>{m.message}</p>
                    <p className={`text-xs mt-1 ${m.senderType === "student" ? "text-navy-300" : "text-gray-400"}`}>
                      {new Date(m.createdAt).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChatSend()}
                placeholder="メッセージを入力..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
              <button
                onClick={handleChatSend}
                disabled={chatSending || !chatInput.trim()}
                className="px-5 py-3 bg-navy-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-navy-700 transition-colors"
              >
                {chatSending ? "送信中" : "送信"}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// ===== 在籍ポータルメインページ =====
function StudentPageInner() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [studentNo, setStudentNo] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    // URLパラメータをwindow.locationから直接取得（useSearchParamsを使わない）
    const params = new URLSearchParams(window.location.search);
    const sno = params.get("studentNo");
    const em = params.get("email");
    if (sno && em) {
      setStudentNo(sno);
      setEmail(em);
      setIsLoggedIn(true);
      return;
    }
    // sessionStorageから復元
    try {
      const stored = sessionStorage.getItem("student_session");
      if (stored) {
        const { sno: s, em: e } = JSON.parse(stored);
        setStudentNo(s); setEmail(e); setIsLoggedIn(true);
      }
    } catch { sessionStorage.removeItem("student_session"); }
  }, []);

  const handleLogin = (sno: string, em: string) => {
    setStudentNo(sno); setEmail(em); setIsLoggedIn(true);
    sessionStorage.setItem("student_session", JSON.stringify({ sno, em }));
  };

  const handleLogout = () => {
    sessionStorage.removeItem("student_session");
    setIsLoggedIn(false); setStudentNo(""); setEmail("");
  };

  if (!isLoggedIn) return <LoginForm onLogin={handleLogin} />;
  return <MyPageContent studentNo={studentNo} email={email} onLogout={handleLogout} />;
}

export default function StudentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-navy-800 flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-white" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <StudentPageInner />
    </Suspense>
  );
}
