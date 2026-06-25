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
