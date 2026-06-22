// 志望校×学科×年度の集計キー。学科FK(applyDepartmentId)を最優先し、無い旧データは
// 正規化した (学校名__学科名) 文字列にフォールバックする。
// これにより学校の分割・改名でも、FK が埋まっていれば定員・予測が正しく突合する。
// （旧データは backfill-school-fk.ts で FK を埋めると完全一致する）

const normJa = (s: string | null | undefined) =>
  (s || "").trim().toLowerCase().replace(/[\s　]+/g, "");

export function schoolAggKey(
  applyDepartmentId: string | null | undefined,
  schoolName: string,
  department: string,
  enrollmentYear: string,
): string {
  const base = applyDepartmentId
    ? `d:${applyDepartmentId}`
    : `s:${normJa(schoolName)}__${normJa(department)}`;
  return `${base}__${(enrollmentYear || "").trim()}`;
}
