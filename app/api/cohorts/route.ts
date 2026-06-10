import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isCoreAdmin } from "@/lib/auth";
import { CohortCreateSchema, CohortPatchSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

async function buildData(
  parsed: Prisma.CohortCreateInput | Prisma.CohortUpdateInput,
  body: Record<string, unknown>,
) {
  const d: Record<string, unknown> = { ...parsed };
  if ("acceptStart" in body) {
    d.acceptStart = body.acceptStart ? new Date(body.acceptStart as string) : null;
  }
  if ("acceptEnd" in body) {
    d.acceptEnd = body.acceptEnd ? new Date(body.acceptEnd as string) : null;
  }
  // examModeTuitionAmounts: object 渡された場合は JSON 文字列に正規化
  if ("examModeTuitionAmounts" in body) {
    const v = body.examModeTuitionAmounts;
    if (v === null || v === undefined || v === "") d.examModeTuitionAmounts = null;
    else if (typeof v === "string") d.examModeTuitionAmounts = v;
    else d.examModeTuitionAmounts = JSON.stringify(v);
  }
  if ("resultPublishedAt" in body) {
    d.resultPublishedAt = body.resultPublishedAt ? new Date(body.resultPublishedAt as string) : null;
  }
  // schoolKey から applySchoolId を派生
  if ("schoolKey" in body) {
    const key = body.schoolKey as string | null;
    if (key) {
      const s = await prisma.applySchool.findUnique({
        where: { schoolKey: key },
        select: { id: true },
      });
      d.applySchoolId = s?.id ?? null;
    } else {
      d.applySchoolId = null;
    }
  }
  return d;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const cohorts = await prisma.cohort.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { applications: true } } },
    });
    return NextResponse.json(cohorts);
  } catch (error) {
    logError("GET /api/cohorts", error);
    return NextResponse.json({ error: "選考一覧の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isCoreAdmin(session)) {
    return NextResponse.json({ error: "選考を操作する権限がありません" }, { status: 403 });
  }
  try {
    const raw = await request.json();
    const parsed = CohortCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = await buildData(parsed.data as Prisma.CohortCreateInput, raw);

    const cohort = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.cohort.updateMany({ data: { isDefault: false } });
      }
      return tx.cohort.create({ data: data as Prisma.CohortCreateInput });
    });
    return NextResponse.json(cohort, { status: 201 });
  } catch (error) {
    logError("POST /api/cohorts", error);
    return NextResponse.json({ error: "選考の作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isCoreAdmin(session)) {
    return NextResponse.json({ error: "選考を操作する権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const raw = await request.json();
    const parsed = CohortPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = await buildData(parsed.data as Prisma.CohortUpdateInput, raw);

    const cohort = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.cohort.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      }
      return tx.cohort.update({ where: { id }, data: data as Prisma.CohortUpdateInput });
    });
    return NextResponse.json(cohort);
  } catch (error) {
    logError("PATCH /api/cohorts", error);
    return NextResponse.json({ error: "選考の更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isCoreAdmin(session)) {
    return NextResponse.json({ error: "選考を操作する権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const count = await prisma.application.count({ where: { cohortId: id } });
    if (count > 0) {
      return NextResponse.json(
        { error: `この選考には${count}件の申請が紐付いているため削除できません` },
        { status: 400 },
      );
    }
    await prisma.cohort.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("DELETE /api/cohorts", error);
    return NextResponse.json({ error: "選考の削除に失敗しました" }, { status: 500 });
  }
}
