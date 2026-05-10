"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useUI } from "@/components/ui/toast";

interface Student {
  id: string; studentNo: string; lastName: string; firstName: string;
  lastNameKana: string | null; firstNameKana: string | null;
  email: string; phone: string | null; nationality: string | null;
  birthDate: string | null; status: string; enrolledAt: string;
  school: { id: string; name: string };
  class: { id: string; name: string; course: { id: string; name: string } } | null;
  _count: { attendances: number };
}
interface AttendanceRecord {
  id: string; date: string; status: string; note: string | null;
  subject: { name: string }; teacher: { name: string } | null;
}
interface LeaveRequest {
  id: string; type: string; startDate: string; endDate: string;
  reason: string; status: string; proofFilePath: string | null; adminNote: string | null; createdAt: string;
}
interface CertRequest {
  id: string; type: string; purpose: string | null; copies: number;
  status: string; createdAt: string; issuedAt: string | null;
}
interface HomeworkSub {
  id: string; status: string; score: number | null; feedback: string | null;
  submittedAt: string | null; gradedAt: string | null;
  homework: { title: string; dueDate: string; maxScore: number; subject: { name: string } };
}

const STATUS_COLORS: Record<string, string> = {
  出席: "bg-green-100 text-green-700", 欠席: "bg-red-100 text-red-700",
  遅刻: "bg-yellow-100 text-yellow-700", 早退: "bg-orange-100 text-orange-700",
  公欠: "bg-blue-100 text-blue-700",
};
const CERT_TYPES = ["在籍証明書", "出席率証明書", "成績証明書", "卒業見込証明書"];

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useUI();
  const [student, setStudent] = useState<Student | null>(null);
  const [tab, setTab] = useState<"attendance" | "homework" | "leave" | "cert">("attendance");
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [certRequests, setCertRequests] = useState<CertRequest[]>([]);
  const [homeworks, setHomeworks] = useState<HomeworkSub[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 出席率計算
  const totalClasses = attendances.length;
  const presentCount = attendances.filter(a => a.status === "出席").length;
  const lateCount = attendances.filter(a => a.status === "遅刻").length;
  const absentCount = attendances.filter(a => a.status === "欠席").length;
  const attendanceRate = totalClasses > 0 ? Math.round(((presentCount + lateCount) / totalClasses) * 100) : 0;

  useEffect(() => {
    fetch(`/api/students/${id}`)
      .then(r => { if (r.status === 401) { router.push("/admin"); return null; } return r.json(); })
      .then(d => { if (d && !d.error) setStudent(d); setLoading(false); });
  }, [id, router]);

  const fetchAttendances = useCallback(async () => {
    const res = await fetch(`/api/attendance?studentId=${id}&month=${month}`);
    const data = await res.json();
    setAttendances(Array.isArray(data) ? data : []);
  }, [id, month]);

  const fetchLeaveRequests = useCallback(async () => {
    const res = await fetch(`/api/leave-requests?studentId=${id}`);
    const data = await res.json();
    setLeaveRequests(Array.isArray(data) ? data : []);
  }, [id]);

  const fetchCertRequests = useCallback(async () => {
    const res = await fetch(`/api/certificate-requests?studentId=${id}`);
    const data = await res.json();
    setCertRequests(Array.isArray(data) ? data : []);
  }, [id]);

  useEffect(() => {
    if (tab === "attendance") fetchAttendances();
    if (tab === "leave") fetchLeaveRequests();
    if (tab === "cert") fetchCertRequests();
  }, [tab, fetchAttendances, fetchLeaveRequests, fetchCertRequests]);

  const handleLeaveReview = async (leaveId: string, status: string) => {
    setSaving(true);
    await fetch(`/api/leave-requests?id=${leaveId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchLeaveRequests();
    setSaving(false);
  };

  const handleCertReview = async (certId: string, status: string) => {
    setSaving(true);
    await fetch(`/api/certificate-requests?id=${certId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchCertRequests();
    setSaving(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    const ok = await confirm({ title: "ステータス変更", message: `ステータスを「${newStatus}」に変更しますか？`, okLabel: "変更" });
    if (!ok) return;
    setSaving(true);
    await fetch(`/api/students/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setStudent(prev => prev ? { ...prev, status: newStatus } : null);
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">読み込み中...</p></div>;
  if (!student) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">学生が見つかりません</p></div>;

  const STUDENT_STATUS_COLORS: Record<string, string> = {
    在籍: "bg-green-100 text-green-800", 休学: "bg-yellow-100 text-yellow-800",
    退学: "bg-red-100 text-red-800", 卒業: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-800 text-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/students" className="text-navy-300 hover:text-white text-sm">← 在籍管理</Link>
            <span className="text-navy-600">/</span>
            <h1 className="font-bold">{student.lastName} {student.firstName}</h1>
          </div>
          <span className="text-navy-300 text-sm font-mono">{student.studentNo}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* 左カラム：学生情報 */}
          <div className="col-span-1 space-y-4">
            <div className="card">
              <div className="flex items-start justify-between mb-3">
                <div className="w-14 h-14 rounded-full bg-navy-800 text-white flex items-center justify-center text-xl font-bold">
                  {student.lastName.slice(0, 1)}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STUDENT_STATUS_COLORS[student.status]}`}>
                  {student.status}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">{student.lastName} {student.firstName}</h2>
              <p className="text-sm text-gray-500">{student.lastNameKana} {student.firstNameKana}</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">学籍番号</span><span className="font-mono text-gray-800">{student.studentNo}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">学校</span><span className="text-gray-800">{student.school.name}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">クラス</span><span className="text-gray-800">{student.class?.name || "—"}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">コース</span><span className="text-gray-800">{student.class?.course?.name || "—"}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">国籍</span><span className="text-gray-800">{student.nationality || "—"}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">Email</span><span className="text-gray-800 text-xs break-all">{student.email}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">入学日</span><span className="text-gray-800">{new Date(student.enrolledAt).toLocaleDateString("ja-JP")}</span></div>
              </div>

              {/* ステータス変更 */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">ステータス変更</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {["在籍", "休学", "退学", "卒業"].map(s => (
                    <button key={s} onClick={() => handleStatusChange(s)}
                      disabled={saving || student.status === s}
                      className={`text-xs py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${student.status === s ? "bg-navy-800 text-white border-navy-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 出席率サマリー */}
            <div className="card">
              <p className="text-xs font-bold text-navy-700 mb-3">📊 出席率（{month}）</p>
              <div className="text-center mb-3">
                <p className={`text-4xl font-bold ${attendanceRate >= 80 ? "text-green-600" : attendanceRate >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                  {attendanceRate}%
                </p>
                <p className="text-xs text-gray-400 mt-1">{presentCount + lateCount} / {totalClasses} コマ</p>
              </div>
              {/* プログレスバー */}
              <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                <div className={`h-2 rounded-full transition-all ${attendanceRate >= 80 ? "bg-green-500" : attendanceRate >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${attendanceRate}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-green-50 rounded-lg p-2"><p className="text-lg font-bold text-green-700">{presentCount}</p><p className="text-green-600">出席</p></div>
                <div className="bg-red-50 rounded-lg p-2"><p className="text-lg font-bold text-red-700">{absentCount}</p><p className="text-red-600">欠席</p></div>
                <div className="bg-yellow-50 rounded-lg p-2"><p className="text-lg font-bold text-yellow-700">{lateCount}</p><p className="text-yellow-600">遅刻</p></div>
                <div className="bg-blue-50 rounded-lg p-2"><p className="text-lg font-bold text-blue-700">{attendances.filter(a => a.status === "公欠").length}</p><p className="text-blue-600">公欠</p></div>
              </div>
            </div>
          </div>

          {/* 右カラム：タブコンテンツ */}
          <div className="col-span-2">
            {/* タブ */}
            <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
              {[
                { key: "attendance", label: "📅 出席記録" },
                { key: "leave", label: "📝 欠席届" },
                { key: "cert", label: "📜 証明書申請" },
                { key: "homework", label: "📚 課題" },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${tab === t.key ? "bg-white shadow text-navy-800" : "text-gray-500 hover:text-gray-700"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* 出席記録 */}
            {tab === "attendance" && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-navy-700">出席記録</p>
                  <input type="month" className="form-input text-sm w-36" value={month}
                    onChange={e => setMonth(e.target.value)} />
                </div>
                {attendances.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">この月の出席記録がありません</p>
                ) : (
                  <div className="space-y-1">
                    {attendances.map(a => (
                      <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-20 shrink-0">{a.date}</span>
                          <span className="text-xs text-gray-700">{a.subject.name}</span>
                          {a.teacher && <span className="text-xs text-gray-400">/ {a.teacher.name}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {a.note && <span className="text-xs text-gray-400 max-w-24 truncate">{a.note}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || "bg-gray-100 text-gray-600"}`}>
                            {a.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 欠席届 */}
            {tab === "leave" && (
              <div className="card">
                <p className="text-sm font-bold text-navy-700 mb-4">欠席届・申請一覧</p>
                {leaveRequests.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">欠席届がありません</p>
                ) : (
                  <div className="space-y-3">
                    {leaveRequests.map(r => (
                      <div key={r.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-800">{r.type}</span>
                            <span className="text-xs text-gray-500">{r.startDate} 〜 {r.endDate}</span>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === "承認" ? "bg-green-100 text-green-700" : r.status === "却下" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {r.status}
                          </span>
                        </div>
                        <div className="px-4 py-3">
                          <p className="text-xs text-gray-700 mb-2">{r.reason}</p>
                          {r.proofFilePath && (
                            <a href={r.proofFilePath} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-navy-600 hover:underline">📎 証明書を見る</a>
                          )}
                          {r.status === "申請中" && (
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => handleLeaveReview(r.id, "承認")} disabled={saving}
                                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">承認</button>
                              <button onClick={() => handleLeaveReview(r.id, "却下")} disabled={saving}
                                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50">却下</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 証明書申請 */}
            {tab === "cert" && (
              <div className="card">
                <p className="text-sm font-bold text-navy-700 mb-4">証明書申請</p>
                {certRequests.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">証明書申請がありません</p>
                ) : (
                  <div className="space-y-3">
                    {certRequests.map(r => (
                      <div key={r.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{r.type}</p>
                          <p className="text-xs text-gray-500">{r.copies}通{r.purpose ? ` · ${r.purpose}` : ""} · {new Date(r.createdAt).toLocaleDateString("ja-JP")}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.status === "発行済" ? "bg-green-100 text-green-700" : r.status === "却下" ? "bg-red-100 text-red-700" : r.status === "承認済" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {r.status}
                          </span>
                          {r.status === "申請中" && (
                            <div className="flex gap-1">
                              <button onClick={() => handleCertReview(r.id, "承認済")} disabled={saving}
                                className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50">承認</button>
                              <button onClick={() => handleCertReview(r.id, "発行済")} disabled={saving}
                                className="text-xs bg-green-600 text-white px-2.5 py-1 rounded-lg hover:bg-green-700 disabled:opacity-50">発行済</button>
                              <button onClick={() => handleCertReview(r.id, "却下")} disabled={saving}
                                className="text-xs bg-red-500 text-white px-2.5 py-1 rounded-lg hover:bg-red-600 disabled:opacity-50">却下</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 課題 */}
            {tab === "homework" && (
              <div className="card">
                <p className="text-sm font-bold text-navy-700 mb-4">課題・提出状況</p>
                {homeworks.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">課題がありません</p>
                ) : (
                  <div className="space-y-3">
                    {homeworks.map(sub => (
                      <div key={sub.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{sub.homework.title}</p>
                            <p className="text-xs text-gray-500">{sub.homework.subject.name} · 期限: {sub.homework.dueDate}</p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${sub.status === "採点済" || sub.status === "返却済" ? "bg-green-100 text-green-700" : sub.status === "提出済" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                            {sub.status}
                          </span>
                        </div>
                        {(sub.score !== null || sub.feedback) && (
                          <div className="px-4 py-3">
                            {sub.score !== null && (
                              <p className="text-sm font-bold text-navy-800 mb-1">
                                {sub.score} / {sub.homework.maxScore}点
                                <span className="ml-2 text-xs font-normal text-gray-500">
                                  ({Math.round((sub.score / sub.homework.maxScore) * 100)}%)
                                </span>
                              </p>
                            )}
                            {sub.feedback && <p className="text-xs text-gray-700">💬 {sub.feedback}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
