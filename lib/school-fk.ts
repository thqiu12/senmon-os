import { getTenantDb } from "@/lib/tenant/scoped";

/**
 * 学校名 + 学科名から FK ID を解決する。
 * 申請・定員・選考 などすべての書き込み箇所で使い、
 * 「文字列同士の照合」を「FK 結合」に置き換えるための単一エントリポイント。
 *
 * - applySchoolId が直接渡された場合はそれを優先する
 * - schoolName から ApplySchool.name で照合
 * - department が指定されていれば、該当 school の active な ApplyDepartment.name で照合
 *
 * getTenantDb() で organizationId スコープ。呼び出し元（applications POST / admin quota POST）は
 * いずれも withTenant ハンドラ内なので文脈は常に存在する。他テナントの学校マスタには照合しない。
 */
export async function resolveSchoolFk(input: {
  applySchoolId?: string | null;
  applyDepartmentId?: string | null;
  schoolName?: string | null;
  department?: string | null;
}): Promise<{ applySchoolId: string | null; applyDepartmentId: string | null; schoolName: string; department: string }> {
  const db = getTenantDb();
  let applySchoolId = input.applySchoolId ?? null;
  let applyDepartmentId = input.applyDepartmentId ?? null;
  let schoolName = input.schoolName ?? "";
  let department = input.department ?? "";

  // FK が来ている場合: 正規データから snapshot を再構成
  if (applySchoolId) {
    const s = await db.applySchool.findFirst({ where: { id: applySchoolId } });
    if (s) schoolName = s.name;
  }
  if (applyDepartmentId) {
    const d = await db.applyDepartment.findFirst({ where: { id: applyDepartmentId } });
    if (d) {
      department = d.name;
      if (!applySchoolId) applySchoolId = d.applySchoolId;
    }
  }

  // 文字列だけ来ている場合: name で照合して FK を埋める
  if (!applySchoolId && schoolName) {
    const s = await db.applySchool.findFirst({ where: { name: schoolName } });
    if (s) applySchoolId = s.id;
  }
  if (!applyDepartmentId && applySchoolId && department) {
    const d = await db.applyDepartment.findFirst({
      where: { applySchoolId, name: department },
    });
    if (d && d.isActive) applyDepartmentId = d.id;
  }

  return { applySchoolId, applyDepartmentId, schoolName, department };
}
