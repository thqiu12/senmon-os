import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";
import { QuotaSchema } from "@/lib/schemas";
import { resolveSchoolFk } from "@/lib/school-fk";

// GET: 定員統計一覧
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    // 定員レコード一覧
    const quotas = await prisma.enrollmentQuota.findMany({
      orderBy: [{ schoolName: "asc" }, { enrollmentYear: "desc" }, { department: "asc" }],
    });

    // 合否は Application.status を真とし、(志望校名・学科・入学年度) の文字列で集計する。
    // これらの文字列は出願フォーム（ApplySchool.name / departments[].name）と一致しており、
    // 定員レコードも同じ文字列で保存される（FK/ApplyDepartment マスタに依存しない）。
    const ACCEPTED = new Set(["合格"]);
    const PENDING = new Set(["受付中", "書類待ち", "書類確認中", "面接待ち", "結果待ち", "補欠合格", "保留"]);

    const grouped = await prisma.application.groupBy({
      by: ["schoolName", "department", "enrollmentYear", "status"],
      _count: { id: true },
    });
    const key = (s: string, d: string, y: string) => `${s}__${d}__${y}`;
    const acceptedMap = new Map<string, number>();
    const pendingMap = new Map<string, number>();
    for (const g of grouped) {
      const k = key(g.schoolName, g.department, g.enrollmentYear);
      if (ACCEPTED.has(g.status)) acceptedMap.set(k, (acceptedMap.get(k) ?? 0) + g._count.id);
      else if (PENDING.has(g.status)) pendingMap.set(k, (pendingMap.get(k) ?? 0) + g._count.id);
    }

    const result = quotas.map((q) => {
      const k = key(q.schoolName, q.department, q.enrollmentYear);
      const accepted = acceptedMap.get(k) ?? 0;
      const pending = pendingMap.get(k) ?? 0;
      const remaining = q.quota - accepted;
      const fillRate = q.quota > 0 ? Math.round((accepted / q.quota) * 100) : 0;
      return {
        id: q.id,
        schoolName: q.schoolName,
        department: q.department,
        enrollmentYear: q.enrollmentYear,
        quota: q.quota,
        accepted,
        pending,
        remaining,
        fillRate,
        memo: q.memo,
      };
    });

    // 定員未設定だが合格者がいる組み合わせを「定員=0」で追加表示
    const quotaSet = new Set(
      quotas.map((q) => key(q.schoolName, q.department, q.enrollmentYear)),
    );
    acceptedMap.forEach((accepted, k) => {
      if (quotaSet.has(k)) return;
      const [schoolName, department, enrollmentYear] = k.split("__");
      result.push({
        id: `unset-${k}`,
        schoolName,
        department,
        enrollmentYear,
        quota: 0,
        accepted,
        pending: pendingMap.get(k) ?? 0,
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
}

// POST: 定員設定の追加・更新
export async function POST(request: NextRequest) {
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
    const q = await prisma.enrollmentQuota.upsert({
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
}

// DELETE: 定員設定削除
export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    await prisma.enrollmentQuota.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
