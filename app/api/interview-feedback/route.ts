import { NextRequest, NextResponse } from "next/server";
import { getSession, canReviewInterviews } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InterviewFeedbackSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!canReviewInterviews(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get("applicationId");
    if (!applicationId) {
      return NextResponse.json({ error: "applicationIdが必要です" }, { status: 400 });
    }
    const feedbacks = await prisma.interviewFeedback.findMany({
      where: { applicationId },
      include: { interviewer: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(feedbacks);
  } catch (e) {
    logError("GET /api/interview-feedback", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!canReviewInterviews(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const parsed = InterviewFeedbackSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;
    const feedback = await prisma.interviewFeedback.create({
      data: {
        applicationId: data.applicationId,
        interviewerId: data.interviewerId ?? null,
        interviewerName: data.interviewerName,
        scoreJapanese: data.scoreJapanese ?? null,
        scoreMotivation: data.scoreMotivation ?? null,
        scorePersonality: data.scorePersonality ?? null,
        scoreAcademic: data.scoreAcademic ?? null,
        scoreOverall: data.scoreOverall ?? null,
        strengths: data.strengths ?? null,
        concerns: data.concerns ?? null,
        notes: data.notes ?? null,
        recommendation: data.recommendation,
      },
      include: { interviewer: { select: { id: true, name: true, role: true } } },
    });
    return NextResponse.json(feedback, { status: 201 });
  } catch (e) {
    logError("POST /api/interview-feedback", e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!canReviewInterviews(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const parsed = InterviewFeedbackSchema.partial().omit({ applicationId: true }).safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const feedback = await prisma.interviewFeedback.update({
      where: { id },
      data: parsed.data,
      include: { interviewer: { select: { id: true, name: true, role: true } } },
    });
    return NextResponse.json(feedback);
  } catch (e) {
    logError("PATCH /api/interview-feedback", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!canReviewInterviews(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    await prisma.interviewFeedback.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    logError("DELETE /api/interview-feedback", e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
