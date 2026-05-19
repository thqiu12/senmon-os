import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";

// POST: 志望校追加
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const body = await request.json();
    const { priority, schoolName, department, course, enrollmentYear, enrollmentMonth, result, memo } = body;

    if (!schoolName || !department || !enrollmentYear || !enrollmentMonth) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    // 同じpriorityが存在する場合は上書き
    const school = await prisma.applicationSchool.upsert({
      where: { applicationId_priority: { applicationId: params.id, priority: priority || 1 } },
      update: { schoolName, department, course: course || null, enrollmentYear, enrollmentMonth, result: result || null, memo: memo || null },
      create: { id: require("crypto").randomUUID(), applicationId: params.id, priority: priority || 1, schoolName, department, course: course || null, enrollmentYear, enrollmentMonth, result: result || null, memo: memo || null, updatedAt: new Date() },
    });

    return NextResponse.json(school, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "追加に失敗しました" }, { status: 500 });
  }
}

// PATCH: 志望校更新（result変更・試験日程設定など）
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const body = await request.json();
    const { schoolId } = body;
    if (!schoolId) return NextResponse.json({ error: "schoolIdが必要です" }, { status: 400 });

    // 許可するフィールドだけ抽出（任意のカラムを書き換えられないように）
    const ALLOWED = new Set([
      "schoolName", "department", "course", "enrollmentYear", "enrollmentMonth",
      "result", "memo",
      "interviewDate", "interviewTime", "interviewPlace", "interviewNotes",
    ]);
    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (k === "schoolId") continue;
      if (!ALLOWED.has(k)) continue;
      updateData[k] = v === "" ? null : v;
    }

    // 所有チェック: 該当 schoolId が本当に params.id 申請のものか確認
    const existing = await prisma.applicationSchool.findUnique({
      where: { id: schoolId },
      select: { applicationId: true },
    });
    if (!existing || existing.applicationId !== params.id) {
      return NextResponse.json({ error: "対象の志望校が見つかりません" }, { status: 404 });
    }

    const school = await prisma.applicationSchool.update({
      where: { id: schoolId },
      data: updateData,
    });

    return NextResponse.json(school);
  } catch (e) {
    console.error("PATCH /api/applications/[id]/schools error:", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

// DELETE: 志望校削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    if (!schoolId) return NextResponse.json({ error: "schoolIdが必要です" }, { status: 400 });

    await prisma.applicationSchool.delete({ where: { id: schoolId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
