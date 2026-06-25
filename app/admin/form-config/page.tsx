"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SchoolsManager } from "@/app/admin/components/SchoolsManager";
import { PaymentSettingsPanel } from "@/app/admin/components/PaymentSettingsPanel";
import { useUI } from "@/components/ui/toast";
import { HelpTip } from "@/components/admin/HelpTip";
import { SkeletonList } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/Icon";
import { APPLICANT_TYPE_LABEL, type ApplicantType } from "@/lib/applicantType";
import { EXAM_MODE_VALUES } from "@/lib/applyExamModes";

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

const SECTIONS = ["個人情報", "連絡先", "住所", "在日情報", "志望・学歴", "書類", "入学手続き書類"];
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

// School tabs (null = 全校共通) は ApplySchool 一覧から動的に構築する。
// タブ id は schoolKey（旧ハードコード SCHOOLS[].id と一致 → 既存の校別設定を保持）。
type SchoolTab = { id: string | null; name: string };
const GLOBAL_TAB: SchoolTab = { id: null, name: "全校共通" };

interface AddFieldForm {
  label: string;
  section: string;
  fieldType: string;
  isRequired: boolean;
  description: string;
  options: string;
}

const emptyAddForm: AddFieldForm = {
  label: "",
  section: "個人情報",
  fieldType: "text",
  isRequired: false,
  description: "",
  options: "",
};

// 学生フォームのプレビュー1項目（実際の入力欄に近い見た目のダミー）
function PreviewField({ f }: { f: FormFieldConfig }) {
  const box = "w-full rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-400";
  let control: ReactNode;
  switch (f.fieldType) {
    case "textarea":
      control = <div className={`${box} h-16`} />;
      break;
    case "select":
      control = (
        <div className={`${box} h-9 px-3 flex items-center justify-between`}>
          選択してください
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
        </div>
      );
      break;
    case "date":
      control = (
        <div className={`${box} h-9 px-3 flex items-center justify-between`}>
          年 / 月 / 日
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
        </div>
      );
      break;
    case "checkbox":
      control = <div className="flex items-center gap-2 text-xs text-gray-400"><span className="w-4 h-4 rounded border border-gray-300 bg-white inline-block" />チェックボックス</div>;
      break;
    case "file":
      control = <div className="w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-3 text-center text-xs text-gray-400">ファイルをアップロード</div>;
      break;
    default:
      control = <div className={`${box} h-9 px-3 flex items-center`}>{f.description || "入力してください"}</div>;
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        {f.label}{f.isRequired && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {control}
    </div>
  );
}

export default function FormConfigPage() {
  const router = useRouter();
  const { confirm } = useUI();
  const [activeTab, setActiveTab] = useState<"form" | "schools" | "general" | "payment">("form");

  // URL クエリ ?tab=general 等で初期タブを切り替えられる（旧 /admin/settings・/admin/payment からのリダイレクト対応）
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    if (t === "form" || t === "schools" || t === "general" || t === "payment") setActiveTab(t);
  }, []);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  // null = 共通スコープ（従来挙動）
  const [selectedApplicantType, setSelectedApplicantType] = useState<ApplicantType | null>(null);
  // 学校タブ: ApplySchool 一覧から動的構築。取得失敗時は 全校共通 のみにフォールバック。
  const [schoolTabs, setSchoolTabs] = useState<SchoolTab[]>([GLOBAL_TAB]);
  const [configs, setConfigs] = useState<FormFieldConfig[]>([]);
  const [examModeOptions, setExamModeOptions] = useState<string[]>([...EXAM_MODE_VALUES]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ドラッグ並べ替え（セクション内）＋ 学生フォームのライブプレビュー
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Add field modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddFieldForm>(emptyAddForm);
  const [addingField, setAddingField] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ fieldKey: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchConfigs = useCallback(async (schoolId: string | null, applicantType: ApplicantType | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (schoolId) params.set("schoolId", schoolId);
      if (applicantType) params.set("applicantType", applicantType);
      const qs = params.toString();
      const url = qs ? `/api/admin/form-config?${qs}` : "/api/admin/form-config";
      const res = await fetch(url);
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      if (!res.ok) throw new Error("取得に失敗しました");
      const data = await res.json();
      setConfigs(Array.isArray(data) ? data : []);
      const em = (Array.isArray(data) ? data : []).find((c: any) => c.fieldKey === "examMode");
      if (em && typeof em.options === "string" && em.options.trim()) {
        setExamModeOptions(em.options.split(/[\n,、]/).map((s: string) => s.trim()).filter(Boolean));
      } else {
        setExamModeOptions([...EXAM_MODE_VALUES]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchConfigs(selectedSchoolId, selectedApplicantType);
  }, [fetchConfigs, selectedSchoolId, selectedApplicantType]);

  // マウント時に ApplySchool 一覧を取得してタブを構築（id=schoolKey）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/schools");
        if (!res.ok) return; // 失敗時は 全校共通 のみのフォールバックを維持
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        const mapped: SchoolTab[] = data
          .filter((s) => s && typeof s.schoolKey === "string")
          .map((s) => ({ id: s.schoolKey as string, name: String(s.name ?? s.schoolKey) }));
        setSchoolTabs([GLOBAL_TAB, ...mapped]);
      } catch {
        /* フォールバック維持 */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSchoolChange = (schoolId: string | null) => {
    setSelectedSchoolId(schoolId);
    setSuccessMsg(null);
    setError(null);
  };

  const handleApplicantTypeChange = (t: ApplicantType | null) => {
    setSelectedApplicantType(t);
    setSuccessMsg(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Attach the current schoolId + applicantType to each config item.
      // examMode は専用カードで管理するため、generic 行としては送らず（重複防止）末尾に1行だけ付与する。
      const examModeRow = {
        fieldKey: "examMode",
        label: "選考区分",
        fieldType: "radio",
        section: "選考区分",
        isEnabled: examModeOptions.length > 0,
        isRequired: true,
        displayOrder: 5,
        description: null,
        options: examModeOptions.join("\n"),
        schoolId: selectedSchoolId,
        applicantType: selectedApplicantType,
      };
      const payload = [
        ...configs.filter(c => c.fieldKey !== "examMode").map(c => ({
          ...c,
          schoolId: selectedSchoolId,
          applicantType: selectedApplicantType,
        })),
        examModeRow,
      ];
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
      await fetchConfigs(selectedSchoolId, selectedApplicantType);
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

  // ドラッグ中、同一セクション内で対象行の手前に移動する
  const handleDragEnter = (target: FormFieldConfig) => {
    if (!dragKey || dragKey === target.fieldKey) return;
    setConfigs(prev => {
      const dragged = prev.find(c => c.fieldKey === dragKey);
      if (!dragged || dragged.section !== target.section) return prev; // セクション内のみ
      const arr = prev.filter(c => c.fieldKey !== dragKey);
      const i = arr.findIndex(c => c.fieldKey === target.fieldKey);
      arr.splice(i, 0, dragged);
      return arr;
    });
  };

  // ドラッグ終了：配列順に合わせて displayOrder を振り直す（保存で永続化）
  const handleDragEnd = () => {
    setConfigs(prev => prev.map((c, i) => ({ ...c, displayOrder: (i + 1) * 10 })));
    setDragKey(null);
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
          options: addForm.options.trim() || null,
          applicantType: selectedApplicantType,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "作成に失敗しました");
      }
      setShowAddModal(false);
      setAddForm(emptyAddForm);
      setSuccessMsg("フィールドを追加しました");
      await fetchConfigs(selectedSchoolId, selectedApplicantType);
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
          applicantType: selectedApplicantType,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "削除に失敗しました");
      }
      setDeleteConfirm(null);
      setSuccessMsg(`「${deleteConfirm.label}」を削除しました`);
      await fetchConfigs(selectedSchoolId, selectedApplicantType);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除エラー");
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const canDelete = (fieldKey: string) =>
    fieldKey.startsWith("custom_") || fieldKey.startsWith("doc_");

  // examMode は専用カードで扱うため、編集リスト（テーブル/プレビュー）からは除外する。
  const editableConfigs = configs.filter(c => c.fieldKey !== "examMode");

  const groupedBySection = SECTIONS.reduce((acc, section) => {
    acc[section] = editableConfigs.filter(c => c.section === section);
    return acc;
  }, {} as Record<string, FormFieldConfig[]>);

  const otherSections = Array.from(new Set(editableConfigs.map(c => c.section))).filter(
    s => !SECTIONS.includes(s)
  );

  const selectedSchoolName = schoolTabs.find(t => t.id === selectedSchoolId)?.name ?? "全校共通";
  const isGlobal = selectedSchoolId === null;
  const customCount = configs.filter(c => c.isCustom).length;

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title inline-flex items-center gap-2">各種設定<HelpTip text={"出願フォームの項目・志望校・全体設定（入学希望年など）・支払い設定をまとめて管理します。上のタブで切り替えてください。"} /></h1>
          <p className="wsdb-topbar-meta">出願フォーム・志望校・全体設定・支払い設定</p>
        </div>
      </div>

      <div>

        {/* 上位タブ: フォームフィールド設定 / 志望校管理 / 全体設定 */}
        <div className="flex border-b border-gray-200 mb-6 gap-1">
          <button
            onClick={() => setActiveTab("form")}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors
              ${activeTab === "form" ? "border-navy-700 text-navy-800 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            フォームフィールド設定
          </button>
          <button
            onClick={() => setActiveTab("schools")}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors
              ${activeTab === "schools" ? "border-navy-700 text-navy-800 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            志望校管理
          </button>
          <button
            onClick={() => setActiveTab("general")}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors
              ${activeTab === "general" ? "border-navy-700 text-navy-800 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            全体設定
          </button>
          <button
            onClick={() => setActiveTab("payment")}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors
              ${activeTab === "payment" ? "border-navy-700 text-navy-800 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            支払い設定
          </button>
        </div>

        {/* 志望校管理タブ */}
        {activeTab === "schools" && <SchoolsManager onUnauthorized={() => router.push("/admin")} />}

        {/* 全体設定タブ（入学希望時期など） */}
        {activeTab === "general" && <GeneralSettingsPanel />}

        {/* 支払い設定タブ（受験料・学費の振込先＋QR、学校別） */}
        {activeTab === "payment" && <PaymentSettingsPanel onUnauthorized={() => router.push("/admin")} />}

        {/* フォームフィールド設定タブ */}
        {activeTab === "form" && <>

        {/* School Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
          <div className="flex overflow-x-auto">
            {schoolTabs.map(tab => {
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

        {/* 出願者タイプ切替（共通 / 日本人 / 留学生） */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-semibold text-gray-500 mr-1">出願者タイプ</span>
          {([null, "japanese", "foreign"] as (ApplicantType | null)[]).map(t => {
            const active = t === selectedApplicantType;
            const label = t === null ? "共通" : APPLICANT_TYPE_LABEL[t];
            return (
              <button
                key={t ?? "__common__"}
                onClick={() => handleApplicantTypeChange(t)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-full border transition-colors
                  ${active
                    ? "border-navy-700 text-navy-800 bg-navy-50"
                    : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}
              >
                {label}
              </button>
            );
          })}
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
                （全校共通をベースに上書き）
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPreviewOpen(true)}
              className="px-4 py-2 bg-white text-navy-800 border border-navy-200 text-sm font-semibold rounded-lg hover:bg-navy-50 transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
              プレビュー
            </button>
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
                    message: `「${selectedSchoolName}」の学校固有設定をすべて削除して全校共通の設定に戻しますか？`,
                    danger: true,
                    okLabel: "リセット",
                  });
                  if (!ok) return;
                  const res = await fetch(`/api/admin/form-config?resetSchoolId=${encodeURIComponent(selectedSchoolId)}`, { method: "PATCH" });
                  if (res.ok) { setSuccessMsg("全校共通の設定に戻しました"); fetchConfigs(selectedSchoolId, selectedApplicantType); }
                  else setError("リセットに失敗しました");
                }}
                className="px-4 py-2 bg-orange-100 text-orange-700 border border-orange-200 text-sm font-semibold rounded-lg hover:bg-orange-200 transition flex items-center gap-1.5"
              >
                全校共通に戻す
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
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>{error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd"/></svg>{successMsg}
          </div>
        )}

        {/* 選考区分・推薦で表示する区分（examMode 専用カード） */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h3 className="font-bold text-gray-800 mb-1">選考区分・推薦で表示する区分</h3>
          <p className="text-xs text-gray-500 mb-3">出願フォームの「選考区分・推薦」に出す区分を選びます（未チェックの区分は出願者に表示されません）。全て外すと選考区分の節ごと非表示になります。</p>
          <div className="flex flex-wrap gap-4">
            {EXAM_MODE_VALUES.map((v) => {
              const checked = examModeOptions.includes(v);
              return (
                <label key={v} className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={(e) =>
                    setExamModeOptions((prev) => e.target.checked
                      ? Array.from(new Set([...prev, v]))
                      : prev.filter((x) => x !== v))
                  } />
                  <span className="text-sm">{v}</span>
                </label>
              );
            })}
          </div>
        </div>

        {loading ? (
          <SkeletonList rows={8} cols={5} />
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
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
              左端のハンドルをドラッグして、同じセクション内で表示順を並べ替えできます。変更後は「保存する」を押してください。
            </div>
            {[...SECTIONS, ...otherSections].map(section => {
              const fields = groupedBySection[section] || editableConfigs.filter(c => c.section === section);
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
                          <th className="w-8 px-2 py-2.5"></th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">フィールドキー</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">ラベル</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">説明（ヒント）</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">セクション</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">種類</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">有効</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">必須</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-600 text-xs">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {fields.map(field => (
                          <tr
                            key={field.fieldKey}
                            onDragEnter={() => handleDragEnter(field)}
                            onDragOver={(e) => e.preventDefault()}
                            className={`transition-colors ${dragKey === field.fieldKey ? "bg-navy-50 ring-1 ring-navy-300" : "hover:bg-gray-50"} ${!field.isEnabled ? "opacity-50" : ""}`}
                          >
                            <td className="px-2 py-3 text-center">
                              <span
                                draggable
                                onDragStart={() => setDragKey(field.fieldKey)}
                                onDragEnd={handleDragEnd}
                                title="ドラッグで並べ替え"
                                className="inline-flex cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">
                              <div className="flex items-center gap-2">
                                {field.fieldType === "file" && (
                                  <span title="ファイルアップロード" className="text-blue-500"><Icon name="doc" className="w-3.5 h-3.5" /></span>
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
      </div>

      {/* 学生フォーム プレビュー */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-gray-800">学生フォーム プレビュー</h3>
                <p className="text-xs text-gray-400 mt-0.5">{selectedSchoolName}・有効な項目のみ／上から表示順</p>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 overflow-y-auto space-y-6">
              {[...SECTIONS, ...otherSections].map((section) => {
                const fs = editableConfigs.filter((c) => c.section === section && c.isEnabled);
                if (fs.length === 0) return null;
                return (
                  <div key={section}>
                    <h4 className="text-xs font-bold text-navy-700 uppercase tracking-wide mb-3 pb-1.5 border-b border-gray-100">{section}</h4>
                    <div className="space-y-3.5">
                      {fs.map((f) => <PreviewField key={f.fieldKey} f={f} />)}
                    </div>
                  </div>
                );
              })}
              {editableConfigs.filter((c) => c.isEnabled).length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">有効な項目がありません</p>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 text-center shrink-0">
              <p className="text-[11px] text-gray-400">実際の出願フォームの簡易プレビューです（選択肢の中身などは省略）</p>
            </div>
          </div>
        </div>
      )}

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
              {addForm.fieldType === "select" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    選択肢（1行に1つ）
                  </label>
                  <textarea
                    value={addForm.options}
                    onChange={e => setAddForm(f => ({ ...f, options: e.target.value }))}
                    placeholder={"例：\n選択肢A\n選択肢B\n選択肢C"}
                    rows={4}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">出願フォームのドロップダウンに表示される選択肢</p>
                </div>
              )}
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
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.9 12.1a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 7m5 4v6m4-6v6M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M4 7h16" /></svg>
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
    </>
  );
}

/* ============================================================================
 * 全体設定パネル：入学希望時期など、フォーム全体に関わる設定。
 * 元 /admin/settings ページの内容をここに統合。
 * ========================================================================== */
function GeneralSettingsPanel() {
  const { toast } = useUI();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [yearsInput, setYearsInput] = useState("");
  const [monthInput, setMonthInput] = useState("4");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ key: string; updatedAt: string; updatedBy: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { setError("設定の取得に失敗しました"); return; }
        setYearsInput(Array.isArray(d.enrollmentYears) ? d.enrollmentYears.join(", ") : "");
        setMonthInput(typeof d.enrollmentMonth === "string" ? d.enrollmentMonth : "4");
        setMeta(d.meta || []);
      })
      .catch(() => setError("ネットワークエラー"))
      .finally(() => setLoading(false));
  }, []);

  const parseYears = (raw: string): string[] =>
    raw.split(/[\s,、，]+/).map((s) => s.trim()).filter((s) => s.length > 0);

  const handleSave = async () => {
    const years = parseYears(yearsInput);
    if (years.length === 0) { setError("入学希望年を 1 つ以上入力してください"); return; }
    if (years.some((y) => !/^\d{4}$/.test(y))) {
      setError("入学希望年は西暦 4 桁で入力してください（例: 2026）");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentYears: years, enrollmentMonth: monthInput }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "保存に失敗しました");
        return;
      }
      toast("設定を保存しました", "success");
      setYearsInput(Array.isArray(j.enrollmentYears) ? j.enrollmentYears.join(", ") : "");
      setMonthInput(j.enrollmentMonth || "4");
    } catch {
      setError("ネットワークエラー");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card">読み込み中...</div>;
  }

  const currentYear = new Date().getFullYear();
  const previewYears = parseYears(yearsInput).filter((y) => /^\d{4}$/.test(y));
  const yearsMeta = meta.find((m) => m.key === "enrollmentYears");

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-navy-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 className="text-lg font-bold text-navy-800">入学希望時期</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="form-label">入学希望年（選択肢） <span className="form-required">*</span></label>
            <input
              type="text"
              className="form-input"
              value={yearsInput}
              onChange={(e) => setYearsInput(e.target.value)}
              placeholder="例: 2026, 2027, 2028"
            />
            <p className="text-xs text-gray-500 mt-1">
              西暦 4 桁をカンマ・スペース・読点で区切って入力してください。出願フォームの「入学希望年」ドロップダウンに表示されます。
            </p>

            {previewYears.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-bold text-blue-700 mb-2">プレビュー（出願フォームでの表示）</p>
                <div className="bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm">
                  <select className="w-full bg-transparent outline-none text-sm">
                    <option>選択してください</option>
                    {[...previewYears].sort().map((y) => (
                      <option key={y}>{y}年</option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-blue-600 mt-1">
                  現在は {previewYears.length} 件の選択肢が登録されます（重複は自動で除去・昇順ソートされます）
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setYearsInput([currentYear, currentYear + 1, currentYear + 2].join(", "))}
                className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg"
              >
                当年 + 今後 2 年（{currentYear}〜{currentYear + 2}）
              </button>
              <button
                type="button"
                onClick={() => setYearsInput([currentYear + 1, currentYear + 2, currentYear + 3].join(", "))}
                className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg"
              >
                来年から 3 年（{currentYear + 1}〜{currentYear + 3}）
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">入学希望月</label>
            <select
              className="form-input"
              value={monthInput}
              onChange={(e) => setMonthInput(e.target.value)}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              現在の出願フォームは表示のみ。実運用では 4 月入学固定で動作しています。
            </p>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-400">
              {yearsMeta?.updatedAt
                ? `最終更新: ${new Date(yearsMeta.updatedAt).toLocaleString("ja-JP")} (${yearsMeta.updatedBy || "不明"})`
                : "未保存（既定値を使用中）"}
            </p>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-6">
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </section>

      <section className="card bg-gray-50">
        <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-2">補足</h3>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li>このページの設定は変更後すぐに出願フォームに反映されます（ブラウザの再読み込みが必要）。</li>
          <li>過去年度を残しておくと、過年度の問い合わせや再申請対応がしやすくなります。</li>
          <li>定員管理の年度フィルタはこの「入学希望年」と連動します（過去のデータがある年度はリストに残ります）。</li>
        </ul>
      </section>
    </div>
  );
}
