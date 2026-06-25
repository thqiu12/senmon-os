// 「全校共通」スコープ廃止に伴う一回限り移行のための純粋ヘルパー。
// FormFieldConfig: schoolId=null（全校共通）の行を各校へ複製し、その後 null 行を削除する。
// Payment: SystemSetting(payment_config) の "__global__" を各校 schoolKey に展開し、__global__ を削除する。
// ここでは DB に触らず、純粋なロジックのみを置く（単体テスト対象）。

type Row = { fieldKey: string; applicantType: string | null };

/**
 * グローバル行のうち、その学校にコピーすべき行を返す。
 * 同じ (fieldKey, applicantType) の行を学校が既に持っていればスキップ
 * （学校別の上書き設定を潰さないため）。applicantType の null と "japanese"/"foreign" は別物として扱う。
 */
export function rowsToCopyForSchool<T extends Row>(globalRows: T[], schoolRows: Row[]): T[] {
  const have = new Set(schoolRows.map((r) => `${r.fieldKey}::${r.applicantType ?? ""}`));
  return globalRows.filter((g) => !have.has(`${g.fieldKey}::${g.applicantType ?? ""}`));
}

/**
 * __global__ を各校に展開（既に該当 schoolKey があれば触らない）、__global__ は削除。
 * __global__ が無ければ削除のみ（no-op に近い、冪等）。
 */
export function expandGlobalPayment(
  map: Record<string, unknown>,
  schoolKeys: string[],
  GLOBAL_KEY: string
): Record<string, unknown> {
  const g = map[GLOBAL_KEY];
  const out: Record<string, unknown> = { ...map };
  if (g) for (const k of schoolKeys) if (!out[k]) out[k] = g;
  delete out[GLOBAL_KEY];
  return out;
}
