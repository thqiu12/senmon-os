import type { ExamModeOption } from "@/lib/applyExamModes";
/**
 * 出願APIの選考区分検証。examMode は schema 上 optional（下書き・未選択あり得る）なので、
 * 「値が指定されている時だけ」配置との不一致を弾く。未指定/空は常に許可。
 * - examMode 未指定/空 → 許可（optional）
 * - 区分0件(節非表示)なのに値が来た → 不正
 * - 値あり → 配置の id のどれかに一致すること
 */
export function isExamModeAllowed(opts: ExamModeOption[], examMode: string | null | undefined): boolean {
  if (!examMode) return true;          // 未指定/空は許可（optional・下書き等）
  if (opts.length === 0) return false; // 節非表示なのに値が来た → 不正
  return opts.some(o => o.id === examMode);
}
