import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";

// GET: 定員統計一覧
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    // 全定員設定を取得
    const quotas = await prisma.enrollmentQuota.findMany({
      orderBy: [{ schoolName: "asc" }, { enrollmentYear: "desc" }, { department: "asc" }],
    });

    // 合格者数をApplicationSchoolから集計（result="合格" のもの）
    const acceptedBySchool = await prisma.applicationSchool.groupBy({
      by: ["schoolName", "department", "enrollmentYear"],
      where: { result: "合格" },
      _count: { id: true },
    });

    // 出願中（合格以外・審査中）の数も集計
    const pendingBySchool = await prisma.applicationSchool.groupBy({
      by: ["schoolName", "department", "enrollmentYear"],
      where: { OR: [{ result: null }, { result: "保留" }] },
      _count: { id: true },
    });

    // マップ化
    const acceptedMap: Record<string, number> = {};
    acceptedBySchool.forEach(a => {
      const key = `${a.schoolName}__${a.department}__${a.enrollmentYear}`;
      acceptedMap[key] = a._count.id;
    });

    const pendingMap: Record<string, number> = {};
    pendingBySchool.forEach(a => {
      const key = `${a.schoolName}__${a.department}__${a.enrollmentYear}`;
      pendingMap[key] = a._count.id;
    });

    // 定員設定がない学科の合格者も拾う（定員未設定の学科）
    const allAccepted = await prisma.applicationSchool.groupBy({
      by: ["schoolName", "department", "enrollmentYear"],
      where: { result: "合格" },
      _count: { id: true },
    });

    // quotasにマージ
    const result = quotas.map(q => {
      const key = `${q.schoolName}__${q.department}__${q.enrollmentYear}`;
      const accepted = acceptedMap[key] || 0;
      const pending = pendingMap[key] || 0;
      const remaining = q.quota - accepted;
      const fillRate = Math.round((accepted / q.quota) * 100);
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

    // 定員未設定だが合格者がいる学科も追加
    const quotaKeys = new Set(quotas.map(q => `${q.schoolName}__${q.department}__${q.enrollmentYear}`));
    const unsetAccepted = allAccepted.filter(a => !quotaKeys.has(`${a.schoolName}__${a.department}__${a.enrollmentYear}`));
    unsetAccepted.forEach(a => {
      const key = `${a.schoolName}__${a.department}__${a.enrollmentYear}`;
      result.push({
        id: `unset-${key}`,
        schoolName: a.schoolName,
        department: a.department,
        enrollmentYear: a.enrollmentYear,
        quota: 0, // 未設定
        accepted: a._count.id,
        pending: pendingMap[key] || 0,
        remaining: -1, // 未設定
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
    const body = await request.json();
    const { schoolName, department, enrollmentYear, quota, memo } = body;
    if (!schoolName || !department || !enrollmentYear || quota == null) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }
    const q = await prisma.enrollmentQuota.upsert({
      where: { schoolName_department_enrollmentYear: { schoolName, department, enrollmentYear } },
      update: { quota: Number(quota), memo: memo || null },
      create: { schoolName, department, enrollmentYear, quota: Number(quota), memo: memo || null },
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
