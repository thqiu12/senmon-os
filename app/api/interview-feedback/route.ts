import { getSession, isAdmin } from "@/lib/auth";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 申請の面接フィードバック一覧
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get("applicationId");
    if (!applicationId) return NextResponse.json({ error: "applicationIdが必要です" }, { status: 400 });

    const feedbacks = await prisma.interviewFeedback.findMany({
      where: { applicationId },
      include: { interviewer: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(feedbacks);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: フィードバック新規作成
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.applicationId || !body.interviewerName) {
      return NextResponse.json({ error: "applicationIdと面接官名は必須です" }, { status: 400 });
    }

    const feedback = await prisma.interviewFeedback.create({
      data: {
        id: crypto.randomUUID(),
        applicationId: body.applicationId,
        updatedAt: new Date(),
        interviewerId: body.interviewerId || null,
        interviewerName: body.interviewerName,
        scoreJapanese: body.scoreJapanese ? parseInt(body.scoreJapanese) : null,
        scoreMotivation: body.scoreMotivation ? parseInt(body.scoreMotivation) : null,
        scorePersonality: body.scorePersonality ? parseInt(body.scorePersonality) : null,
        scoreAcademic: body.scoreAcademic ? parseInt(body.scoreAcademic) : null,
        scoreOverall: body.scoreOverall ? parseInt(body.scoreOverall) : null,
        strengths: body.strengths || null,
        concerns: body.concerns || null,
        notes: body.notes || null,
        recommendation: body.recommendation || "保留",
      },
      include: { interviewer: { select: { id: true, name: true, role: true } } },
    });
    return NextResponse.json(feedback, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

// PATCH: フィードバック更新
export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const body = await request.json();

    const feedback = await prisma.interviewFeedback.update({
      where: { id },
      data: {
        ...(body.interviewerName !== undefined && { interviewerName: body.interviewerName }),
        ...(body.interviewerId !== undefined && { interviewerId: body.interviewerId }),
        ...(body.scoreJapanese !== undefined && { scoreJapanese: body.scoreJapanese ? parseInt(body.scoreJapanese) : null }),
        ...(body.scoreMotivation !== undefined && { scoreMotivation: body.scoreMotivation ? parseInt(body.scoreMotivation) : null }),
        ...(body.scorePersonality !== undefined && { scorePersonality: body.scorePersonality ? parseInt(body.scorePersonality) : null }),
        ...(body.scoreAcademic !== undefined && { scoreAcademic: body.scoreAcademic ? parseInt(body.scoreAcademic) : null }),
        ...(body.scoreOverall !== undefined && { scoreOverall: body.scoreOverall ? parseInt(body.scoreOverall) : null }),
        ...(body.strengths !== undefined && { strengths: body.strengths }),
        ...(body.concerns !== undefined && { concerns: body.concerns }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.recommendation !== undefined && { recommendation: body.recommendation }),
      },
      include: { interviewer: { select: { id: true, name: true, role: true } } },
    });
    return NextResponse.json(feedback);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

// DELETE: フィードバック削除
export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    await prisma.interviewFeedback.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
