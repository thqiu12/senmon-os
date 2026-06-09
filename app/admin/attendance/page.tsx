"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface School { id: string; name: string; }
interface Course { id: string; name: string; }
interface Class { id: string; name: string; courseId: string; }
interface Subject { id: string; name: string; courseId: string; }
interface Student { id: string; studentNo: string; lastName: string; firstName: string; classId: string | null; }
interface AttendanceStatus { [studentId: string]: string; }
interface AttendanceNote { [studentId: string]: string; }

const STATUSES = ["出席", "欠席", "遅刻", "早退", "公欠"];
const STATUS_COLORS: Record<string, string> = {
  出席: "bg-green-500 text-white", 欠席: "bg-red-500 text-white",
  遅刻: "bg-yellow-500 text-white", 早退: "bg-orange-500 text-white",
  公欠: "bg-blue-500 text-white",
};

export default function AttendancePage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statuses, setStatuses] = useState<AttendanceStatus>({});
  const [notes, setNotes] = useState<AttendanceNote>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/schools")
      .then(r => { if (r.status === 401) { router.push("/admin"); return null; } return r.json(); })
      .then(d => { if (d) { setSchools(d); if (d.length) setSelectedSchool(d[0].id); } });
  }, [router]);

  useEffect(() => {
    if (!selectedSchool) return;
    // コース・クラス・科目を取得
    fetch(`/api/schools`)
      .then(r => r.json())
      .then(d => {
        const s = d.find((sc: { id: string; courses: Course[] }) => sc.id === selectedSchool);
        if (s) {
          setCourses(s.courses || []);
          // クラス取得
          fetch(`/api/timetable?schoolId=${selectedSchool}`)
            .then(r => r.json())
            .then(td => {
              const cls: Class[] = td.map((t: { class: Class }) => t.class).filter((c: Class, i: number, arr: Class[]) => arr.findIndex(x => x.id === c.id) === i);
              setClasses(cls);
            });
        }
      });
  }, [selectedSchool]);

  // 科目リスト（固定+APIから）
  useEffect(() => {
    if (!selectedSchool) return;
    fetch(`/api/schools`)
      .then(r => r.json())
      .then((d: { id: string; courses: { subjects?: Subject[] }[] }[]) => {
        const school = d.find(s => s.id === selectedSchool);
        if (school) {
          const subs = school.courses.flatMap(c => c.subjects || []);
          setSubjects(subs);
        }
      });
  }, [selectedSchool]);

  const fetchStudents = useCallback(async () => {
    if (!selectedClass) return;
    const res = await fetch(`/api/students?schoolId=${selectedSchool}&classId=${selectedClass}&status=在籍`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    setStudents(list);
    // デフォルト全員「出席」
    const defaults: AttendanceStatus = {};
    list.forEach((s: Student) => { defaults[s.id] = "出席"; });
    setStatuses(defaults);
    setNotes({});
  }, [selectedClass, selectedSchool]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const handleSave = async () => {
    if (!selectedSubject || !date || students.length === 0) return;
    setSaving(true);
    const records = students.map(s => ({
      studentId: s.id,
      subjectId: selectedSubject,
      date,
      status: statuses[s.id] || "出席",
      note: notes[s.id] || null,
    }));
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const setAllStatus = (status: string) => {
    const all: AttendanceStatus = {};
    students.forEach(s => { all[s.id] = status; });
    setStatuses(all);
  };

  const presentCount = students.filter(s => statuses[s.id] === "出席").length;
  const absentCount = students.filter(s => statuses[s.id] === "欠席").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-800 text-white py-4 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-navy-300 hover:text-white text-sm">ダッシュボード</Link>
            <span className="text-navy-600">/</span>
            <h1 className="font-bold">出席入力</h1>
          </div>
          {saved && <span className="text-green-300 text-sm font-medium">保存しました</span>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* 入力条件 */}
        <div className="card mb-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="form-label">学校</label>
              <select className="form-input" value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)}>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">クラス</label>
              <select className="form-input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                <option value="">クラスを選択</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">科目</label>
              <select className="form-input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                <option value="">科目を選択</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">日付</label>
              <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
        </div>

        {students.length > 0 && (
          <>
            {/* 統計バー */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">全{students.length}名</span>
                <span className="text-green-600 font-semibold">出席 {presentCount}</span>
                <span className="text-red-600 font-semibold">欠席 {absentCount}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAllStatus("出席")} className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 font-medium">全員出席</button>
                <button onClick={() => setAllStatus("欠席")} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 font-medium">全員欠席</button>
              </div>
            </div>

            {/* 出席入力テーブル */}
            <div className="card overflow-hidden p-0 mb-5">
              <table className="w-full text-sm">
                <thead className="bg-navy-800 text-white">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold w-24">学籍番号</th>
                    <th className="text-left px-4 py-3 font-semibold">氏名</th>
                    <th className="text-center px-4 py-3 font-semibold">出欠</th>
                    <th className="text-left px-4 py-3 font-semibold">メモ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map(s => (
                    <tr key={s.id} className={`${statuses[s.id] === "欠席" ? "bg-red-50" : statuses[s.id] === "遅刻" ? "bg-yellow-50" : ""}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{s.studentNo}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{s.lastName} {s.firstName}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 justify-center flex-wrap">
                          {STATUSES.map(st => (
                            <button key={st} onClick={() => setStatuses(prev => ({ ...prev, [s.id]: st }))}
                              className={`text-xs px-2 py-1 rounded-lg transition-colors font-medium ${statuses[s.id] === st ? STATUS_COLORS[st] : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                              {st}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="text" className="form-input text-xs py-1.5" placeholder="備考"
                          value={notes[s.id] || ""}
                          onChange={e => setNotes(prev => ({ ...prev, [s.id]: e.target.value }))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving || !selectedSubject}
                className="btn-primary px-8 disabled:opacity-50">
                {saving ? "保存中..." : "出席を保存する"}
              </button>
            </div>
          </>
        )}

        {selectedClass && students.length === 0 && (
          <div className="card text-center py-10 text-gray-400">
            <p className="text-2xl mb-2">👥</p>
            <p>このクラスに在籍学生がいません</p>
          </div>
        )}
      </main>
    </div>
  );
}
