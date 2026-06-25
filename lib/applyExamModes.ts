// 選考区分（examMode）は値固定。学校×タイプ別の「許可リスト」だけ FormFieldConfig(options) で持つ。
export const EXAM_MODE_VALUES = ["一般", "指定推薦", "特待生"] as const;
export type ExamModeValue = (typeof EXAM_MODE_VALUES)[number];

// generic field 機構（registry/DynamicField/custom）に乗せない構造的フィールド。
export const STRUCTURAL_KEYS = new Set<string>([
  "examMode", "referrerName", "referrerType",
  "schoolId", "schoolName", "department", "course",
  "enrollmentYear", "enrollmentMonth",
]);

type CfgRow = { fieldKey: string; isEnabled?: boolean; options?: string | null };

/**
 * 出願フォームに表示する選考区分を返す（EXAM_MODE_VALUES の並び順を保持）。
 * - examMode 行が無い → 3区分すべて（後方互換）
 * - examMode 行があり isEnabled===false → []（節ごと非表示）
 * - options があれば EXAM_MODE_VALUES に含まれる値だけ（順序は EXAM_MODE_VALUES 準拠）
 * - options が空（行はあるが options なし） → 3区分すべて
 */
export function enabledExamModes(formConfig: CfgRow[] | null | undefined): ExamModeValue[] {
  const all = [...EXAM_MODE_VALUES];
  if (!formConfig) return all;
  const row = formConfig.find((c) => c.fieldKey === "examMode");
  if (!row) return all;
  if (row.isEnabled === false) return [];
  const opt = (row.options ?? "").split(/[\n,、]/).map((s) => s.trim()).filter(Boolean);
  if (opt.length === 0) return all;
  return all.filter((v) => opt.includes(v));
}

export type ExamModeOption = {
  id: string;
  label: string;
  exam: boolean;        // 筆記試験あり=true / 免除=false
  showReferrer: boolean; // 推薦機関名・種別欄を出す
  description: string;   // 選択時の案内（任意）
};

export const DEFAULT_EXAM_MODES: ExamModeOption[] = [
  { id: "一般",   label: "一般選考", exam: true,  showReferrer: true,  description: "" },
  { id: "指定推薦", label: "指定推薦", exam: false, showReferrer: true,  description: "" },
  { id: "特待生",   label: "特待生選考", exam: false, showReferrer: false, description: "特待生選考の要件を満たす方が対象です。" },
];

function normalizeOption(o: any): ExamModeOption | null {
  if (!o || typeof o.id !== "string" || !o.id) return null;
  return {
    id: o.id,
    label: typeof o.label === "string" && o.label ? o.label : o.id,
    exam: o.exam === true,
    showReferrer: o.showReferrer === true,
    description: typeof o.description === "string" ? o.description : "",
  };
}

/** examMode 設定行の options(JSON or 旧CSV or 空) → 区分配列。 */
export function parseExamModeOptions(options: string | null | undefined): ExamModeOption[] {
  if (!options || !options.trim()) return DEFAULT_EXAM_MODES;
  const t = options.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) {
        const out = arr.map(normalizeOption).filter((x): x is ExamModeOption => x !== null);
        return out.length ? out : DEFAULT_EXAM_MODES;
      }
    } catch { /* fallthrough */ }
    return DEFAULT_EXAM_MODES;
  }
  // 旧CSV(#2): 既定のうち列挙された id だけ（既定属性付き）
  const ids = t.split(/[\n,、]/).map(s => s.trim()).filter(Boolean);
  const picked = DEFAULT_EXAM_MODES.filter(d => ids.includes(d.id));
  return picked.length ? picked : DEFAULT_EXAM_MODES;
}

type Cfg = { fieldKey: string; isEnabled?: boolean; options?: string | null };
/** formConfig 内 examMode 行から区分配列。行なし→既定。isEnabled=false→[]（節非表示）。 */
export function examModesForConfig(formConfig: Cfg[] | null | undefined): ExamModeOption[] {
  if (!formConfig) return DEFAULT_EXAM_MODES;
  const row = formConfig.find(c => c.fieldKey === "examMode");
  if (!row) return DEFAULT_EXAM_MODES;
  if (row.isEnabled === false) return [];
  return parseExamModeOptions(row.options);
}

export function examModeLabel(opts: ExamModeOption[], id: string): string {
  return opts.find(o => o.id === id)?.label ?? id;
}
