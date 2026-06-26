// 「共通(applicantType=null)」スコープ廃止に伴う一回限り移行のための純粋ヘルパー。
// FormFieldConfig: applicantType=null（共通）の行を各タイプ（japanese / foreign）へ複製し、
// その後 null 行を削除する。ここでは DB に触らず、純粋なロジックのみを置く（単体テスト対象）。

type Row = { fieldKey: string };

/** 共通(null)行のうち、対象タイプにまだ無い fieldKey だけコピー対象に返す。 */
export function nullRowsToCopyForType<T extends Row>(nullRows: T[], typeRows: Row[]): T[] {
  const have = new Set(typeRows.map((r) => r.fieldKey));
  return nullRows.filter((n) => !have.has(n.fieldKey));
}
