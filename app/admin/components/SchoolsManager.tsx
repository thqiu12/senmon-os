"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Department {
  name: string;
  duration: string;
  courses: string[];
}

interface ApplySchool {
  id: string;
  schoolKey: string;
  name: string;
  hojin: string;
  icon: string;
  isActive: boolean;
  displayOrder: number;
  departments: Department[];
}

const DURATION_OPTIONS = ["1年制", "2年制", "3年制", "4年制"];

const emptyForm = {
  schoolKey: "",
  name: "",
  hojin: "",
  icon: "🏫",
  isActive: true,
  displayOrder: 0,
};

const emptyDepartment = (): Department => ({ name: "", duration: "2年制", courses: [] });

// Department row editor sub-component
function DepartmentRow({
  dept,
  index,
  onChange,
  onRemove,
}: {
  dept: Department;
  index: number;
  onChange: (updated: Department) => void;
  onRemove: () => void;
}) {
  const [addingCourse, setAddingCourse] = useState(false);
  const [newCourse, setNewCourse] = useState("");

  const handleAddCourse = () => {
    const trimmed = newCourse.trim();
    if (!trimmed) { setAddingCourse(false); return; }
    onChange({ ...dept, courses: [...dept.courses, trimmed] });
    setNewCourse("");
    setAddingCourse(false);
  };

  // フォーカスが外れた時も自動確定（未入力ならキャンセル）
  const handleCourseBlur = () => {
    if (newCourse.trim()) {
      handleAddCourse();
    } else {
      setAddingCourse(false);
    }
  };

  const handleCourseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCourse();
    } else if (e.key === "Escape") {
      setNewCourse("");
      setAddingCourse(false);
    }
  };

  const handleRemoveCourse = (ci: number) => {
    onChange({ ...dept, courses: dept.courses.filter((_, i) => i !== ci) });
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-3">
          {/* Name + Duration row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                学科名
              </label>
              <input
                type="text"
                value={dept.name}
                onChange={e => onChange({ ...dept, name: e.target.value })}
                placeholder="例：大学・大学院受験科"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                修業年限
              </label>
              <select
                value={dept.duration}
                onChange={e => onChange({ ...dept, duration: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
              >
                {DURATION_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Courses section */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              コース
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {dept.courses.map((course, ci) => (
                <span
                  key={ci}
                  className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-1 rounded-full"
                >
                  {course}
                  <button
                    type="button"
                    onClick={() => handleRemoveCourse(ci)}
                    className="text-blue-400 hover:text-red-500 transition-colors leading-none ml-0.5 font-bold"
                    title="コースを削除"
                  >
                    ×
                  </button>
                </span>
              ))}
              {addingCourse ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    autoFocus
                    type="text"
                    value={newCourse}
                    onChange={e => setNewCourse(e.target.value)}
                    onKeyDown={handleCourseKeyDown}
                    onBlur={handleCourseBlur}
                    placeholder="コース名を入力"
                    className="px-2 py-1 text-xs border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 w-32"
                  />
                  <button
                    type="button"
                    onClick={handleAddCourse}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    追加
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNewCourse(""); setAddingCourse(false); }}
                    className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition"
                  >
                    キャンセル
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingCourse(true)}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 px-2 py-1 rounded-full hover:border-blue-500 transition"
                >
                  <span className="font-bold">+</span> コースを追加
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Remove department button */}
        <button
          type="button"
          onClick={onRemove}
          title="この学科を削除"
          className="mt-1 shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="sr-only">この学科を削除</span>
        </button>
      </div>
    </div>
  );
}

// form-config ページから埋め込み利用するためのコンポーネント
export function SchoolsManager({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const router = useRouter();
  const [schools, setSchools] = useState<ApplySchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSchools = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/schools");
      if (res.status === 401) { onUnauthorized ? onUnauthorized() : router.push("/admin"); return; }
      if (!res.ok) throw new Error("取得に失敗しました");
      const data = await res.json();
      setSchools(Array.isArray(data) ? data : []);
    } catch (e) { setError(e instanceof Error ? e.message : "エラーが発生しました"); }
    finally { setLoading(false); }
  }, [router, onUnauthorized]);

  useEffect(() => { fetchSchools(); }, [fetchSchools]);

  const openAdd = () => { setEditId(null); setForm({ ...emptyForm }); setDepartments([]); setFormError(null); setShowModal(true); };
  const openEdit = (s: ApplySchool) => {
    setEditId(s.id); setForm({ schoolKey: s.schoolKey, name: s.name, hojin: s.hojin, icon: s.icon, isActive: s.isActive, displayOrder: s.displayOrder });
    setDepartments(Array.isArray(s.departments) ? s.departments.map(d => ({ name: d.name ?? "", duration: d.duration ?? "2年制", courses: Array.isArray(d.courses) ? d.courses : [] })) : []);
    setFormError(null); setShowModal(true);
  };
  const handleDeptChange = (index: number, updated: Department) => { setDepartments(prev => prev.map((d, i) => i === index ? updated : d)); };
  const handleDeptRemove = (index: number) => { setDepartments(prev => prev.filter((_, i) => i !== index)); };
  const handleAddDepartment = () => { setDepartments(prev => [...prev, emptyDepartment()]); };
  const handleSave = async () => {
    setFormError(null);
    if (!form.schoolKey.trim() || !form.name.trim() || !form.hojin.trim()) { setFormError("schoolKey、学校名、法人名は必須です"); return; }
    const cleanDepts = departments.filter(d => d.name.trim() !== "");
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const payload = { ...form, departments: cleanDepts };
      const body = editId ? { id: editId, ...payload } : payload;
      const res = await fetch("/api/admin/schools", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "保存に失敗しました"); }
      setShowModal(false); setSuccessMsg(editId ? "学校情報を更新しました" : "学校を追加しました"); await fetchSchools();
    } catch (e) { setFormError(e instanceof Error ? e.message : "エラーが発生しました"); }
    finally { setSaving(false); }
  };
  const handleToggleActive = async (s: ApplySchool) => {
    try {
      const res = await fetch("/api/admin/schools", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, isActive: !s.isActive }) });
      if (res.ok) await fetchSchools();
    } catch { /* ignore */ }
  };
  const handleDelete = async () => {
    if (!deleteConfirm) return; setDeleting(true);
    try {
      const res = await fetch("/api/admin/schools", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deleteConfirm.id }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "削除に失敗しました"); }
      setDeleteConfirm(null); setSuccessMsg("学校を削除しました"); await fetchSchools();
    } catch (e) { setError(e instanceof Error ? e.message : "削除に失敗しました"); }
    finally { setDeleting(false); }
  };
  return (
    <div>
      <div className="py-2">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">志望校管理</h2>
            <p className="text-sm text-gray-500 mt-1">
              出願フォームに表示する志望校を管理します。
            </p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition flex items-center gap-1.5"
          >
            <span className="text-base leading-none">+</span> 学校を追加
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>{error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd"/></svg>{successMsg}
          </div>
        )}

        {loading ? (
          <div className="card text-center py-16">
            <svg className="animate-spin w-8 h-8 text-navy-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-500 mt-3">読み込み中...</p>
          </div>
        ) : schools.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 text-center py-16 shadow-sm">
            <p className="text-gray-400 text-sm mb-4">学校が登録されていません。「学校を追加」から追加してください。</p>
            <button onClick={openAdd} className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition">
              学校を追加
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-navy-800 text-white px-4 py-2.5">
              <h3 className="font-semibold text-sm">志望校一覧 ({schools.length}件)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">順序</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">学校名</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">法人名</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">schoolKey</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">学科数</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">有効</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schools.map(school => (
                    <tr key={school.id} className={`hover:bg-gray-50 transition-colors ${!school.isActive ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 text-gray-500 text-center w-16">
                        {school.displayOrder}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{school.name}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{school.hojin}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{school.schoolKey}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                          {Array.isArray(school.departments) ? school.departments.length : 0}学科
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={school.isActive}
                            onChange={() => handleToggleActive(school)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-navy-600"></div>
                        </label>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(school)}
                            className="text-navy-600 hover:text-navy-800 hover:bg-navy-50 px-2 py-1 rounded text-xs font-semibold transition-colors"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ id: school.id, name: school.name })}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded text-xs font-semibold transition-colors"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-800 text-base">
                {editId ? "学校を編集" : "学校を追加"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    schoolKey <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.schoolKey}
                    onChange={e => setForm(f => ({ ...f, schoolKey: e.target.value }))}
                    placeholder="例：chuo-seminar"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">英数字・ハイフンのみ（変更不可推奨）</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  学校名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例：中央ゼミナール"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  法人名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.hojin}
                  onChange={e => setForm(f => ({ ...f, hojin: e.target.value }))}
                  placeholder="例：学校法人 羽場学園"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    表示順
                  </label>
                  <input
                    type="number"
                    value={form.displayOrder}
                    onChange={e => setForm(f => ({ ...f, displayOrder: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 accent-navy-600"
                    />
                    <span className="text-sm font-medium text-gray-700">有効（出願フォームに表示）</span>
                  </label>
                </div>
              </div>

              {/* Departments editor */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  学科情報
                </label>
                <div className="space-y-3">
                  {departments.length === 0 && (
                    <p className="text-xs text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded-xl">
                      学科が登録されていません。「+ 学科を追加」から追加してください。
                    </p>
                  )}
                  {departments.map((dept, i) => (
                    <DepartmentRow
                      key={i}
                      dept={dept}
                      index={i}
                      onChange={updated => handleDeptChange(i, updated)}
                      onRemove={() => handleDeptRemove(i)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={handleAddDepartment}
                    className="w-full py-2 text-sm font-semibold text-emerald-700 border-2 border-dashed border-emerald-300 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition flex items-center justify-center gap-1.5"
                  >
                    <span className="text-base leading-none">+</span> 学科を追加
                  </button>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-navy-800 rounded-lg hover:bg-navy-700 transition disabled:opacity-50"
              >
                {saving ? "保存中..." : (editId ? "更新する" : "追加する")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                              </div>
              <h3 className="font-bold text-gray-800 text-base text-center mb-2">学校を削除</h3>
              <p className="text-sm text-gray-600 text-center">
                「<span className="font-semibold">{deleteConfirm.name}</span>」を削除しますか？
              </p>
              <p className="text-xs text-gray-400 text-center mt-1">この操作は取り消せません。</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-center gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-5 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition disabled:opacity-50"
              >
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

