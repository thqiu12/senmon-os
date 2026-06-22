// 学校別の筆記試験ポリシー。
// 東京デジタルビジネス専門学校（TDB）は筆記試験を行わない（一般選考も含め全区分で筆記免除）。
// クライアント（schoolId）でもサーバー（schoolName）でも判定できるよう両対応。
const NO_WRITTEN_EXAM_SCHOOL_IDS = ["tdb"];

export function isNoWrittenExamSchool(arg: { schoolId?: string | null; schoolName?: string | null }): boolean {
  if (arg.schoolId && NO_WRITTEN_EXAM_SCHOOL_IDS.includes(arg.schoolId)) return true;
  const name = arg.schoolName || "";
  // 学校名での判定（保存時は schoolName しか持たないケースに対応）
  return /デジタルビジネス|TDB/i.test(name);
}

/**
 * 学科の筆記有無設定を加味した「筆記免除か」判定。
 *  - 学科フラグ hasWrittenExam===false → 免除（学科設定が最優先）
 *  - それ以外（true / 未設定）→ 旧来の学校名フォールバック（TDB 等の後方互換）
 * これにより既存校(TDB)の挙動を保ちつつ、学科ごとに「筆記なし」を設定できる。
 */
export function isWrittenExamExempt(arg: {
  hasWrittenExam?: boolean | null;
  schoolId?: string | null;
  schoolName?: string | null;
}): boolean {
  if (arg.hasWrittenExam === false) return true;
  return isNoWrittenExamSchool({ schoolId: arg.schoolId, schoolName: arg.schoolName });
}
