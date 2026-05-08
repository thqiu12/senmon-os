import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const cohorts = await prisma.cohort.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { applications: true } },
      },
    });
    return NextResponse.json(cohorts);
  } catch (error) {
    console.error("GET /api/cohorts error:", error);
    return NextResponse.json({ error: "選考一覧の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: "選考名は必須です" }, { status: 400 });
    }

    // isDefault=true の場合、他のバッチをfalseに
    if (body.isDefault) {
      await prisma.cohort.updateMany({ data: { isDefault: false } });
    }

    const cohort = await prisma.cohort.create({
      data: {
        name: body.name,
        description: body.description || null,
        examDate: body.examDate || null,
        deadline: body.deadline || null,
        status: body.status || "受付中",
        isDefault: body.isDefault || false,
        year: body.year || new Date().getFullYear(),
        round: body.round || 1,
        defaultTuitionPlan:      body.defaultTuitionPlan      || null,
        defaultTuitionAmount:    body.defaultTuitionAmount    || null,
        defaultTuitionAmount2:   body.defaultTuitionAmount2   || null,
        defaultTuitionDeadline:  body.defaultTuitionDeadline  || null,
        defaultTuitionDeadline2: body.defaultTuitionDeadline2 || null,
        defaultTuitionBankInfo:  body.defaultTuitionBankInfo  || null,
        defaultStep2Deadline:    body.defaultStep2Deadline    || null,
        defaultStep3Deadline:    body.defaultStep3Deadline    || null,
      },
    });
    return NextResponse.json(cohort, { status: 201 });
  } catch (error) {
    console.error("POST /api/cohorts error:", error);
    return NextResponse.json({ error: "選考の作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    }
    const body = await request.json();

    // isDefault=true の場合、他のバッチをfalseに
    if (body.isDefault) {
      await prisma.cohort.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
    }

    const cohort = await prisma.cohort.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.examDate !== undefined && { examDate: body.examDate }),
        ...(body.deadline !== undefined && { deadline: body.deadline }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
        ...(body.year !== undefined && { year: body.year }),
        ...(body.round !== undefined && { round: body.round }),
        ...(body.defaultTuitionPlan      !== undefined && { defaultTuitionPlan:      body.defaultTuitionPlan }),
        ...(body.defaultTuitionAmount    !== undefined && { defaultTuitionAmount:    body.defaultTuitionAmount }),
        ...(body.defaultTuitionAmount2   !== undefined && { defaultTuitionAmount2:   body.defaultTuitionAmount2 }),
        ...(body.defaultTuitionDeadline  !== undefined && { defaultTuitionDeadline:  body.defaultTuitionDeadline }),
        ...(body.defaultTuitionDeadline2 !== undefined && { defaultTuitionDeadline2: body.defaultTuitionDeadline2 }),
        ...(body.defaultTuitionBankInfo  !== undefined && { defaultTuitionBankInfo:  body.defaultTuitionBankInfo }),
        ...(body.defaultStep2Deadline    !== undefined && { defaultStep2Deadline:    body.defaultStep2Deadline }),
        ...(body.defaultStep3Deadline    !== undefined && { defaultStep3Deadline:    body.defaultStep3Deadline }),
      },
    });
    return NextResponse.json(cohort);
  } catch (error) {
    console.error("PATCH /api/cohorts error:", error);
    return NextResponse.json({ error: "選考の更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    }

    // 申請が紐付いている場合は削除不可
    const count = await prisma.application.count({ where: { cohortId: id } });
    if (count > 0) {
      return NextResponse.json(
        { error: `この選考には${count}件の申請が紐付いているため削除できません` },
        { status: 400 }
      );
    }

    await prisma.cohort.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/cohorts error:", error);
    return NextResponse.json({ error: "選考の削除に失敗しました" }, { status: 500 });
  }
}
