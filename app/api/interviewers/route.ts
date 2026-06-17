import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin, canReviewInterviews } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InterviewerCreateSchema, InterviewerPatchSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  // 面接官は面接レビュー画面で面接官リストを参照するため GET は許可（作成/編集/削除は isAdmin のまま）
  if (!canReviewInterviews(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const interviewers = await prisma.interviewer.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { interviews: true } } },
    });
    return NextResponse.json(interviewers);
  } catch (e) {
    logError("GET /api/interviewers", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const parsed = InterviewerCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const interviewer = await prisma.interviewer.create({
      data: { ...parsed.data, role: parsed.data.role ?? null, email: parsed.data.email ?? null },
    });
    return NextResponse.json(interviewer, { status: 201 });
  } catch (e) {
    logError("POST /api/interviewers", e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const parsed = InterviewerPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const interviewer = await prisma.interviewer.update({ where: { id }, data: parsed.data });
    return NextResponse.json(interviewer);
  } catch (e) {
    logError("PATCH /api/interviewers", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    await prisma.interviewer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    logError("DELETE /api/interviewers", e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
