import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { QuotaSchema } from "@/lib/schemas";
import { resolveSchoolFk } from "@/lib/school-fk";
import { schoolAggKey } from "@/lib/schoolAgg";

// GET: 定員統計一覧
export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const db = getTenantDb();
    // 定員レコード一覧
    const quotas = await db.enrollmentQuota.findMany({
      orderBy: [{ schoolName: "asc" }, { enrollmentYear: "desc" }, { department: "asc" }],
    });

    // 合否は Application.status を真とし、学科FK(applyDepartmentId)優先＋文字列フォールバックで集計。
    // 定員レコードも同じキーで突合するため、学校の分割・改名でも(FKが埋まっていれば)正しく合致する。
    const ACCEPTED = new Set(["合格"]);
    const PENDING = new Set(["受付中", "書類待ち", "書類確認中", "面接待ち", "結果待ち", "補欠合格", "保留"]);

    const grouped = await db.application.groupBy({
      by: ["applySchoolId", "applyDepartmentId", "schoolName", "department", "enrollmentYear", "status"],
      where: { deletedAt: null },
      _count: { id: true },
    });
    type Agg = { accepted: number; pending: number };
    const aggMap = new Map<string, Agg>();
    const labelMap = new Map<string, { schoolName: string; department: string; enrollmentYear: string }>();
    for (const g of grouped) {
      const k = schoolAggKey(g.applyDepartmentId, g.schoolName, g.department, g.enrollmentYear);
      let a = aggMap.get(k);
      if (!a) { a = { accepted: 0, pending: 0 }; aggMap.set(k, a); }
      if (ACCEPTED.has(g.status)) a.accepted += g._count.id;
      else if (PENDING.has(g.status)) a.pending += g._count.id;
      if (!labelMap.has(k)) labelMap.set(k, { schoolName: g.schoolName, department: g.department, enrollmentYear: g.enrollmentYear });
    }

    const result = quotas.map((q) => {
      const k = schoolAggKey(q.applyDepartmentId, q.schoolName, q.department, q.enrollmentYear);
      const agg = aggMap.get(k) ?? { accepted: 0, pending: 0 };
      const remaining = q.quota - agg.accepted;
      const fillRate = q.quota > 0 ? Math.round((agg.accepted / q.quota) * 100) : 0;
      return {
        id: q.id,
        schoolName: q.schoolName,
        department: q.department,
        enrollmentYear: q.enrollmentYear,
        quota: q.quota,
        accepted: agg.accepted,
        pending: agg.pending,
        remaining,
        fillRate,
        memo: q.memo,
      };
    });

    // 定員未設定だが合格者がいる組み合わせを「定員=0」で追加表示
    const quotaKeys = new Set(
      quotas.map((q) => schoolAggKey(q.applyDepartmentId, q.schoolName, q.department, q.enrollmentYear)),
    );
    aggMap.forEach((agg, k) => {
      if (quotaKeys.has(k) || agg.accepted === 0) return;
      const lbl = labelMap.get(k);
      result.push({
        id: `unset-${k}`,
        schoolName: lbl?.schoolName ?? "",
        department: lbl?.department ?? "",
        enrollmentYear: lbl?.enrollmentYear ?? "",
        quota: 0,
        accepted: agg.accepted,
        pending: agg.pending,
        remaining: -1,
        fillRate: -1,
        memo: null,
      });
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

// POST: 定員設定の追加・更新
export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const parsed = QuotaSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { schoolName, department, enrollmentYear, quota, memo } = parsed.data;
    const fk = await resolveSchoolFk({ schoolName, department });
    const q = await getTenantDb().enrollmentQuota.upsert({
      where: { schoolName_department_enrollmentYear: { schoolName, department, enrollmentYear } },
      update: {
        quota, memo: memo ?? null,
        applySchoolId: fk.applySchoolId,
        applyDepartmentId: fk.applyDepartmentId,
      },
      create: {
        schoolName: fk.schoolName || schoolName,
        department: fk.department || department,
        enrollmentYear,
        quota,
        memo: memo ?? null,
        applySchoolId: fk.applySchoolId,
        applyDepartmentId: fk.applyDepartmentId,
      },
    });
    return NextResponse.json(q, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
});

// DELETE: 定員設定削除
export const DELETE = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    await getTenantDb().enrollmentQuota.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
});
