"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SCHOOLS } from "@/lib/formFieldDefaults";
import { SchoolsManager } from "@/app/admin/components/SchoolsManager";
import { useUI } from "@/components/ui/toast";

interface FormFieldConfig {
  id: string;
  fieldKey: string;
  schoolId?: string | null;
  label: string;
  fieldType: string;
  isEnabled: boolean;
  isRequired: boolean;
  displayOrder: number;
  section: string;
  description?: string | null;
  isCustom?: boolean;
}

const SECTIONS = ["個人情報", "連絡先", "住所", "在日情報", "志望・学歴", "書類"];
const FIELD_TYPES = ["text", "select", "textarea", "checkbox", "date", "tel", "email", "file"];

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "テキスト",
  select: "選択",
  textarea: "テキストエリア",
  checkbox: "チェックボックス",
  date: "日付",
  tel: "電話番号",
  email: "メール",
  file: "ファイル",
};

// School tabs: null = 全校共通（グローバル）
const SCHOOL_TABS: { id: string | null; name: string }[] = [
  { id: null, name: "全校共通" },
  ...SCHOOLS.map(s => ({ id: s.id, name: s.name })),
];

interface AddFieldForm {
  label: string;
  section: string;
  fieldType: string;
  isRequired: boolean;
  description: string;
}

const emptyAddForm: AddFieldForm = {
  label: "",
  section: "個人情報",
  fieldType: "text",
  isRequired: false,
  description: "",
};

export default function FormConfigPage() {
  const router = useRouter();
  const { confirm } = useUI();
  const [activeTab, setActiveTab] = useState<"form" | "schools">("form");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<FormFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add field modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddFieldForm>(emptyAddForm);
  const [addingField, setAddingField] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ fieldKey: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchConfigs = useCallback(async (schoolId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = schoolId
        ? `/api/admin/form-config?schoolId=${encodeURIComponent(schoolId)}`
        : "/api/admin/form-config";
      const res = await fetch(url);
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      if (!res.ok) throw new Error("取得に失敗しました");
      const data = await res.json();
      setConfigs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchConfigs(selectedSchoolId);
  }, [fetchConfigs, selectedSchoolId]);

  const handleSchoolChange = (schoolId: string | null) => {
    setSelectedSchoolId(schoolId);
    setSuccessMsg(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Attach the current schoolId to each config item
      const payload = configs.map(c => ({
        ...c,
        schoolId: selectedSchoolId,
      }));
      const res = await fetch("/api/admin/form-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "保存に失敗しました");
      }
      setSuccessMsg("保存しました");
      // Reload to reflect isCustom state
      await fetchConfigs(selectedSchoolId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (fieldKey: string, key: keyof FormFieldConfig, value: string | boolean | number | null) => {
    setConfigs(prev =>
      prev.map(c => c.fieldKey === fieldKey ? { ...c, [key]: value } : c)
    );
  };

  const handleAddField = async () => {
    if (!addForm.label.trim()) {
      setAddError("ラベルを入力してください");
      return;
    }
    setAddingField(true);
    setAddError(null);
    try {
      const maxOrder = configs.reduce((m, c) => Math.max(m, c.displayOrder), 0);
      const res = await fetch("/api/admin/form-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: addForm.label.trim(),
          section: addForm.section,
          fieldType: addForm.fieldType,
          isRequired: addForm.isRequired,
          isEnabled: true,
          displayOrder: maxOrder + 10,
          schoolId: selectedSchoolId,
          description: addForm.description.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "作成に失敗しました");
      }
      setShowAddModal(false);
      setAddForm(emptyAddForm);
      setSuccessMsg("フィールドを追加しました");
      await fetchConfigs(selectedSchoolId);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setAddingField(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/form-config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey: deleteConfirm.fieldKey,
          schoolId: selectedSchoolId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "削除に失敗しました");
      }
      setDeleteConfirm(null);
      setSuccessMsg(`「${deleteConfirm.label}」を削除しました`);
      await fetchConfigs(selectedSchoolId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除エラー");
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const canDelete = (fieldKey: string) =>
    fieldKey.startsWith("custom_") || fieldKey.startsWith("doc_");

  const groupedBySection = SECTIONS.reduce((acc, section) => {
    acc[section] = configs.filter(c => c.section === section);
    return acc;
  }, {} as Record<string, FormFieldConfig[]>);

  const otherSections = Array.from(new Set(configs.map(c => c.section))).filter(
    s => !SECTIONS.includes(s)
  );

  const selectedSchoolName = SCHOOL_TABS.find(t => t.id === selectedSchoolId)?.name ?? "全校共通";
  const isGlobal = selectedSchoolId === null;
  const customCount = configs.filter(c => c.isCustom).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy-800 text-white shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-navy-800 font-bold text-sm">専</span>
            </div>
            <div className="hidden lg:block">
              <h1 className="font-bold text-sm leading-tight">フォーム設定</h1>
              <p className="text-navy-400 text-xs">入学出願システム</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/dashboard"
              className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700"
            >
              ← ダッシュボードへ
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">フォーム管理</h2>
          </div>
        </div>

        {/* 上位タブ: フォームフィールド設定 / 志望校管理 */}
        <div className="flex border-b border-gray-200 mb-6 gap-1">
          <button
            onClick={() => setActiveTab("form")}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors
              ${activeTab === "form" ? "border-navy-700 text-navy-800 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            📋 フォームフィールド設定
          </button>
          <button
            onClick={() => setActiveTab("schools")}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors
              ${activeTab === "schools" ? "border-navy-700 text-navy-800 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            🏫 志望校管理
          </button>
        </div>

        {/* 志望校管理タブ */}
        {activeTab === "schools" && <SchoolsManager onUnauthorized={() => router.push("/admin")} />}

        {/* フォームフィールド設定タブ */}
        {activeTab === "form" && <>

        {/* School Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
          <div className="flex overflow-x-auto">
            {SCHOOL_TABS.map(tab => {
              const active = tab.id === selectedSchoolId;
              return (
                <button
                  key={tab.id ?? "__global__"}
                  onClick={() => handleSchoolChange(tab.id)}
                  className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors
                    ${active
                      ? "border-navy-700 text-navy-800 bg-navy-50"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                >
                  {tab.id === null && <span className="mr-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">共通</span>}
                  {tab.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Context info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700">
              {isGlobal ? "全校共通デフォルト設定" : `${selectedSchoolName} — カスタム設定`}
            </span>
            {!isGlobal && customCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                {customCount}件カスタム
              </span>
            )}
            {!isGlobal && !loading && (
              <span className="text-xs text-gray-400">
                （グローバルをベースに上書き）
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowAddModal(true); setAddError(null); setAddForm(emptyAddForm); }}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition flex items-center gap-1.5"
            >
              <span className="text-base leading-none">+</span> フィールド追加
            </button>
            {selectedSchoolId && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: "学校固有設定をリセット",
                    message: `「${selectedSchoolId}」の学校固有設定をすべて削除してグローバル設定に戻しますか？`,
                    danger: true,
                    okLabel: "リセット",
                  });
                  if (!ok) return;
                  const res = await fetch(`/api/admin/form-config?resetSchoolId=${encodeURIComponent(selectedSchoolId)}`, { method: "PATCH" });
                  if (res.ok) { setSuccessMsg("グローバル設定に戻しました"); fetchConfigs(selectedSchoolId); }
                  else setError("リセットに失敗しました");
                }}
                className="px-4 py-2 bg-orange-100 text-orange-700 border border-orange-200 text-sm font-semibold rounded-lg hover:bg-orange-200 transition flex items-center gap-1.5"
              >
                🔄 グローバル設定に戻す
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || configs.length === 0}
              className="px-5 py-2 bg-navy-800 text-white text-sm font-semibold rounded-lg hover:bg-navy-700 transition disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
            <span>⚠️</span>{error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
            <span>✅</span>{successMsg}
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
        ) : configs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 text-center py-16 shadow-sm">
            <p className="text-gray-400 text-sm mb-4">
              {isGlobal
                ? "フォームフィールド設定がありません。「＋フィールド追加」から追加してください。"
                : `${selectedSchoolName}のカスタム設定がありません。「＋フィールド追加」から追加してください。`}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {[...SECTIONS, ...otherSections].map(section => {
              const fields = groupedBySection[section] || configs.filter(c => c.section === section);
              if (fields.length === 0) return null;
              return (
                <div key={section} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="bg-navy-800 text-white px-4 py-2.5">
                    <h3 className="font-semibold text-sm">{section}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">フィールドキー</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">ラベル</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">説明（ヒント）</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">セクション</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">種類</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">表示順</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">有効</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">必須</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {fields.map(field => (
                          <tr key={field.fieldKey} className={`hover:bg-gray-50 transition-colors ${!field.isEnabled ? "opacity-50" : ""}`}>
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">
                              <div className="flex items-center gap-2">
                                {field.fieldType === "file" && (
                                  <span title="ファイルアップロード">📎</span>
                                )}
                                {field.fieldKey}
                                {!isGlobal && field.isCustom && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                                    カスタム
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={field.label}
                                onChange={e => updateField(field.fieldKey, "label", e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500"
                              />
                            </td>
                            <td className="px-4 py-3 min-w-[160px]">
                              <input
                                type="text"
                                value={field.description ?? ""}
                                onChange={e => updateField(field.fieldKey, "description", e.target.value)}
                                placeholder="ヒントテキスト（任意）"
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={field.section}
                                onChange={e => updateField(field.fieldKey, "section", e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-500"
                              >
                                {SECTIONS.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                                ${field.fieldType === "file" ? "bg-blue-100 text-blue-700" :
                                  field.fieldType === "select" ? "bg-purple-100 text-purple-700" :
                                  field.fieldType === "textarea" ? "bg-orange-100 text-orange-700" :
                                  field.fieldType === "checkbox" ? "bg-green-100 text-green-700" :
                                  "bg-gray-100 text-gray-600"}`}>
                                {FIELD_TYPE_LABELS[field.fieldType] ?? field.fieldType}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="number"
                                value={field.displayOrder}
                                onChange={e => updateField(field.fieldKey, "displayOrder", Number(e.target.value))}
                                className="w-16 px-2 py-1 text-sm border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-navy-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={field.isEnabled}
                                  onChange={e => updateField(field.fieldKey, "isEnabled", e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-navy-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-navy-600"></div>
                              </label>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={field.isRequired}
                                  onChange={e => updateField(field.fieldKey, "isRequired", e.target.checked)}
                                  className="sr-only peer"
                                  disabled={!field.isEnabled}
                                />
                                <div className={`w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500 ${!field.isEnabled ? "opacity-50 cursor-not-allowed" : ""}`}></div>
                              </label>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {canDelete(field.fieldKey) && (
                                <button
                                  onClick={() => setDeleteConfirm({ fieldKey: field.fieldKey, label: field.label })}
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors text-xs font-semibold"
                                  title="削除"
                                >
                                  削除
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Bottom Save Button */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => { setShowAddModal(true); setAddError(null); setAddForm(emptyAddForm); }}
                className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition flex items-center gap-1.5"
              >
                <span className="text-base leading-none">+</span> フィールド追加
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-navy-800 text-white text-sm font-semibold rounded-lg hover:bg-navy-700 transition disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        )}
        </>}
      </main>

      {/* Add Field Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-base">フィールドを追加</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  ラベル <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addForm.label}
                  onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="例：パスポート番号"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  セクション
                </label>
                <select
                  value={addForm.section}
                  onChange={e => setAddForm(f => ({ ...f, section: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {SECTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  フィールドタイプ
                </label>
                <select
                  value={addForm.fieldType}
                  onChange={e => setAddForm(f => ({ ...f, fieldType: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {FIELD_TYPES.map(t => (
                    <option key={t} value={t}>{FIELD_TYPE_LABELS[t] ?? t}（{t}）</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.isRequired}
                    onChange={e => setAddForm(f => ({ ...f, isRequired: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 accent-emerald-600"
                  />
                  <span className="text-sm font-medium text-gray-700">必須フィールドにする</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  説明・ヒントテキスト（任意）
                </label>
                <input
                  type="text"
                  value={addForm.description}
                  onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="例：入力例やヒントを記入してください"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-gray-400 mt-1">フィールドのラベル下に表示されるヒントテキスト</p>
              </div>
              {addError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {addError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddField}
                disabled={addingField}
                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {addingField ? "追加中..." : "追加する"}
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
                🗑️
              </div>
              <h3 className="font-bold text-gray-800 text-base text-center mb-2">フィールドを削除</h3>
              <p className="text-sm text-gray-600 text-center">
                「<span className="font-semibold">{deleteConfirm.label}</span>」を削除しますか？
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
                onClick={handleDeleteConfirm}
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
