import type { ExamModeOption } from "@/lib/applyExamModes";
/** examMode が学校の区分配置に含まれるか。区分0件(節非表示)なら空のみ許可。 */
export function isExamModeAllowed(opts: ExamModeOption[], examMode: string | null | undefined): boolean {
  if (opts.length === 0) return !examMode; // 節非表示時は未選択のみOK
  return !!examMode && opts.some(o => o.id === examMode);
}
