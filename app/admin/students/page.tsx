"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface School { id: string; name: string; shortName: string; courses: Course[]; _count: { students: number; teachers: number }; }
interface Course { id: string; name: string; code: string | null; classes: Class[]; }
interface Class { id: string; name: string; year: number; }
interface Student {
  id: string; studentNo: string; lastName: string; firstName: string;
  lastNameKana: string | null; email: string; nationality: string | null;
  status: string; enrolledAt: string; classId: string | null;
  school: { id: string; name: string }; class: { id: string; name: string } | null;
  _count: { attendances: number; homeworkSubmissions: number };
}
interface EnrollableApp {
  id: string; applicationNo: string; lastName: string; firstName: string;
  schoolName: string; enrollmentYear: string; status: string;
  enrollmentProcedure: { completedAt: string | null } | null;
}

const STATUS_COLORS: Record<string, string> = {
  在籍: "bg-green-100 text-green-800", 休学: "bg-yellow-100 text-yellow-800",
  退学: "bg-red-100 text-red-800", 卒業: "bg-gray-100 text-gray-600",
};

export default function StudentsPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("在籍");
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollableApps, setEnrollableApps] = useState<EnrollableApp[]>([]);
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [enrollClassId, setEnrollClassId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<{ enrolled: number; errors: {id:string;error:string}[] } | null>(null);

  useEffect(() => {
    fetch("/api/schools")
      .then(r => { if (r.status === 401) { router.push("/admin"); return null; } return r.json(); })
      .then(d => { if (d) { setSchools(d); if (d.length > 0) setSelectedSchool(d[0].id); } });
  }, [router]);

  const fetchStudents = useCallback(async () => {
    if (!selectedSchool) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ schoolId: selectedSchool });
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/students?${params}`);
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, [selectedSchool, statusFilter, search]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const openEnrollModal = async () => {
    const res = await fetch("/api/applications?status=合格&limit=200");
    const data = await res.json();
    // 入学手続き完了済み・未転換のみ
    const apps = (data.applications || []).filter((a: EnrollableApp) =>
      a.enrollmentProcedure?.completedAt
    );
    setEnrollableApps(apps);
    setSelectedAppIds([]);
    setEnrollClassId("");
    setEnrollResult(null);
    setShowEnrollModal(true);
  };

  const handleEnroll = async () => {
    if (!selectedAppIds.length || !selectedSchool) return;
    setEnrolling(true);
    try {
      const res = await fetch("/api/students/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationIds: selectedAppIds, schoolId: selectedSchool, classId: enrollClassId || null }),
      });
      const data = await res.json();
      setEnrollResult(data);
      if (data.enrolled > 0) fetchStudents();
    } finally { setEnrolling(false); }
  };

  const currentSchool = schools.find(s => s.id === selectedSchool);
  const allClasses = currentSchool?.courses.flatMap(c => (c as unknown as { classes?: Class[] }).classes || []) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-800 text-white py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-navy-300 hover:text-white text-sm">← ダッシュボード</Link>
            <span className="text-navy-600">/</span>
            <h1 className="font-bold">在籍学生管理</h1>
          </div>
          <button onClick={openEnrollModal}
            className="bg-white text-navy-800 text-sm font-bold px-4 py-2 rounded-lg hover:bg-navy-50 transition-colors">
            📋 出願→在籍 一括転換
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* 学校タブ */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {schools.map(s => (
            <button key={s.id} onClick={() => setSelectedSchool(s.id)}
              className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${selectedSchool === s.id ? "border-navy-700 text-navy-800" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {s.name}
              <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{s._count.students}</span>
            </button>
          ))}
        </div>

        {/* 統計カード */}
        {currentSchool && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "在籍", color: "bg-green-50 border-green-200 text-green-800" },
              { label: "休学", color: "bg-yellow-50 border-yellow-200 text-yellow-800" },
              { label: "退学", color: "bg-red-50 border-red-200 text-red-800" },
              { label: "卒業", color: "bg-gray-50 border-gray-200 text-gray-700" },
            ].map(({ label, color }) => (
              <div key={label} className={`rounded-xl border p-4 text-center ${color}`}>
                <p className="text-2xl font-bold">{students.filter(s => s.status === label).length}</p>
                <p className="text-xs mt-1 font-medium">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* フィルター */}
        <div className="card mb-4 p-4">
          <div className="flex gap-3 flex-wrap">
            <input type="text" placeholder="氏名・学籍番号・メールで検索" className="form-input flex-1 min-w-48"
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input w-32" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">全ステータス</option>
              {["在籍", "休学", "退学", "卒業"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* 学生一覧 */}
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-navy-800 text-white">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">学籍番号</th>
                <th className="text-left px-4 py-3 font-semibold">氏名</th>
                <th className="text-left px-4 py-3 font-semibold">クラス</th>
                <th className="text-left px-4 py-3 font-semibold">国籍</th>
                <th className="text-left px-4 py-3 font-semibold">入学日</th>
                <th className="text-left px-4 py-3 font-semibold">状態</th>
                <th className="text-left px-4 py-3 font-semibold">出席</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">読み込み中...</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                  <p className="text-2xl mb-2">🎓</p>
                  <p>在籍学生がいません</p>
                  <p className="text-xs mt-1">「出願→在籍 一括転換」で転換してください</p>
                </td></tr>
              ) : students.map(student => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{student.studentNo}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{student.lastName} {student.firstName}</p>
                    <p className="text-xs text-gray-400">{student.lastNameKana}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{student.class?.name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{student.nationality || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{student.enrolledAt ? new Date(student.enrolledAt).toLocaleDateString("ja-JP") : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[student.status] || "bg-gray-100 text-gray-600"}`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{student._count.attendances}件</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/students/${student.id}`}
                      className="text-xs text-navy-700 hover:text-navy-900 font-medium border border-navy-200 px-2.5 py-1.5 rounded-lg hover:bg-navy-50 transition-colors">
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* 一括転換モーダル */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-bold text-navy-800">📋 出願→在籍 一括転換</h3>
              <p className="text-xs text-gray-500 mt-1">入学手続き完了済みの合格者を在籍学生に転換します</p>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {enrollResult ? (
                <div className="text-center py-6">
                  <p className="text-4xl mb-3">🎓</p>
                  <p className="text-xl font-bold text-navy-800">{enrollResult.enrolled}名を在籍転換しました</p>
                  {enrollResult.errors.length > 0 && (
                    <div className="mt-4 text-left">
                      <p className="text-sm font-semibold text-red-700 mb-2">エラー ({enrollResult.errors.length}件):</p>
                      {enrollResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600">{e.id}: {e.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* クラス選択 */}
                  <div className="mb-4">
                    <label className="form-label">転換先クラス（任意）</label>
                    <select className="form-input" value={enrollClassId} onChange={e => setEnrollClassId(e.target.value)}>
                      <option value="">クラス未設定</option>
                      {allClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* 対象者選択 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">
                        転換対象を選択 ({selectedAppIds.length}/{enrollableApps.length})
                      </p>
                      <button onClick={() => setSelectedAppIds(selectedAppIds.length === enrollableApps.length ? [] : enrollableApps.map(a => a.id))}
                        className="text-xs text-navy-600 hover:underline">
                        {selectedAppIds.length === enrollableApps.length ? "全解除" : "全選択"}
                      </button>
                    </div>
                    {enrollableApps.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">入学手続き完了済みの合格者がいません</p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto border border-gray-200 rounded-xl p-3">
                        {enrollableApps.map(app => (
                          <label key={app.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${selectedAppIds.includes(app.id) ? "bg-navy-50 border border-navy-200" : "hover:bg-gray-50 border border-transparent"}`}>
                            <input type="checkbox" checked={selectedAppIds.includes(app.id)}
                              onChange={e => setSelectedAppIds(prev => e.target.checked ? [...prev, app.id] : prev.filter(i => i !== app.id))}
                              className="rounded text-navy-600" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{app.lastName} {app.firstName}</p>
                              <p className="text-xs text-gray-500">{app.applicationNo} · {app.schoolName} · {app.enrollmentYear}入学</p>
                            </div>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">手続完了</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => setShowEnrollModal(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                {enrollResult ? "閉じる" : "キャンセル"}
              </button>
              {!enrollResult && (
                <button onClick={handleEnroll} disabled={enrolling || !selectedAppIds.length}
                  className="flex-1 btn-primary text-sm disabled:opacity-50">
                  {enrolling ? "転換中..." : `${selectedAppIds.length}名を在籍転換する`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
