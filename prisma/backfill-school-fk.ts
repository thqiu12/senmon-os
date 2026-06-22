/**
 * 既存データの志望校FK(applySchoolId / applyDepartmentId)を、スナップショット文字列
 * (schoolName / department)から解決して埋める一度きりのスクリプト。
 *
 * 集計(定員・分析)をFK優先に切り替えたため、旧データもFKを埋めると正しく突合する。
 * 学校の分割(例: 神奈川柔整鍼灸 → 医療系/進学)に対応するため、学校名でダメなら
 * 「学科名のグローバル一意一致」でも解決する。
 *
 * 実行: npx tsx prisma/backfill-school-fk.ts   （冪等。何度流しても安全）
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resolveFk(schoolName: string, department: string) {
  let applySchoolId: string | null = null;
  let applyDepartmentId: string | null = null;

  // 1) 学校名 → 学校、その配下の学科名 → 学科
  if (schoolName) {
    const s = await prisma.applySchool.findFirst({ where: { name: schoolName }, select: { id: true } });
    if (s) {
      applySchoolId = s.id;
      if (department) {
        const d = await prisma.applyDepartment.findFirst({
          where: { applySchoolId: s.id, name: department },
          select: { id: true },
        });
        if (d) applyDepartmentId = d.id;
      }
    }
  }
  // 2) 学科が決まらなければ、学科名のグローバル一意一致で解決（分割校の曖昧さ解消）
  if (!applyDepartmentId && department) {
    const ds = await prisma.applyDepartment.findMany({ where: { name: department }, select: { id: true, applySchoolId: true } });
    if (ds.length === 1) {
      applyDepartmentId = ds[0].id;
      applySchoolId = ds[0].applySchoolId;
    }
  }
  return { applySchoolId, applyDepartmentId };
}

async function main() {
  const stats = { app: 0, appUnresolved: 0, applicationSchool: 0, quota: 0 };

  const apps = await prisma.application.findMany({
    where: { OR: [{ applySchoolId: null }, { applyDepartmentId: null }] },
    select: { id: true, schoolName: true, department: true },
  });
  for (const a of apps) {
    const fk = await resolveFk(a.schoolName, a.department);
    if (fk.applySchoolId || fk.applyDepartmentId) {
      await prisma.application.update({ where: { id: a.id }, data: fk });
      stats.app++;
    } else {
      stats.appUnresolved++;
    }
  }

  const ass = await prisma.applicationSchool.findMany({
    where: { OR: [{ applySchoolId: null }, { applyDepartmentId: null }] },
    select: { id: true, schoolName: true, department: true },
  });
  for (const s of ass) {
    const fk = await resolveFk(s.schoolName, s.department);
    if (fk.applySchoolId || fk.applyDepartmentId) {
      await prisma.applicationSchool.update({ where: { id: s.id }, data: fk });
      stats.applicationSchool++;
    }
  }

  const quotas = await prisma.enrollmentQuota.findMany({
    where: { OR: [{ applySchoolId: null }, { applyDepartmentId: null }] },
    select: { id: true, schoolName: true, department: true },
  });
  for (const q of quotas) {
    const fk = await resolveFk(q.schoolName, q.department);
    if (fk.applySchoolId || fk.applyDepartmentId) {
      await prisma.enrollmentQuota.update({ where: { id: q.id }, data: fk });
      stats.quota++;
    }
  }

  console.log("backfill-school-fk done:", JSON.stringify(stats));
  if (stats.appUnresolved > 0) {
    console.log(`⚠ ${stats.appUnresolved} 件の出願は学校名/学科名がマスタと一致せず未解決（志望校管理で名称を合わせると次回解決）。`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
