import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";

// GET: 課題一覧
export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get("subjectId");
    const where: Record<string, unknown> = {};
    if (subjectId) where.subjectId = subjectId;
    const homeworks = await getTenantDb().homework.findMany({
      where,
      orderBy: { dueDate: "asc" },
      include: {
        subject: { select: { id: true, name: true } },
        _count: { select: { submissions: true } },
      },
    });
    return NextResponse.json(homeworks);
  } catch (e) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

// POST: 課題作成
export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.subjectId || !body.title || !body.dueDate) {
      return NextResponse.json({ error: "subjectId・title・dueDateは必須です" }, { status: 400 });
    }
    const hw = await getTenantDb().homework.create({
      data: {
        id: require("crypto").randomUUID(),
        subjectId: body.subjectId,
        updatedAt: new Date(),
        title: body.title,
        description: body.description || null,
        dueDate: body.dueDate,
        maxScore: body.maxScore || 100,
        isPublished: body.isPublished || false,
      },
    });
    return NextResponse.json(hw, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
});

// PATCH: 課題更新（採点・フィードバック含む）
export const PATCH = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const submissionId = searchParams.get("submissionId");
    const db = getTenantDb();

    if (submissionId) {
      // 採点・フィードバック
      const body = await request.json();
      const sub = await db.homeworkSubmission.update({
        where: { id: submissionId },
        data: {
          ...(body.score !== undefined && { score: body.score }),
          ...(body.feedback !== undefined && { feedback: body.feedback }),
          ...(body.status && { status: body.status }),
          ...(body.teacherId && { teacherId: body.teacherId }),
          ...(body.status === "採点済" && { gradedAt: new Date() }),
        },
      });
      return NextResponse.json(sub);
    }

    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const body = await request.json();
    const hw = await db.homework.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.dueDate && { dueDate: body.dueDate }),
        ...(body.maxScore !== undefined && { maxScore: body.maxScore }),
        ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
      },
    });
    return NextResponse.json(hw);
  } catch (e) {
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});
