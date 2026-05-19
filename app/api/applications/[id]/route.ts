import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";
import { ApplicationPatchSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const session = await getSession(request);
    const isAdmin = checkAdmin(session);

    const application = await prisma.application.findUnique({
      where: { id: params.id },
      include: {
        documents: true,
        adminNotes: { orderBy: { createdAt: "desc" } },
        enrollmentProcedure: true,
        enrollmentSignature: true,
        agent: true,
        cohort: { select: { id: true, name: true } },
        applicationSchools: { orderBy: { priority: "asc" } },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    if (!isAdmin) {
      if (!email || application.email !== email) {
        return NextResponse.json({ error: "アクセスが拒否されました" }, { status: 403 });
      }
      const { adminMemo: _m, interviewEmailSent: _ies, resultEmailSent: _res, ...publicData } = application as
        & typeof application
        & { adminMemo?: unknown; interviewEmailSent?: unknown; resultEmailSent?: unknown };
      return NextResponse.json(publicData);
    }

    return NextResponse.json(application);
  } catch (error) {
    logError("GET /api/applications/[id]", error);
    return NextResponse.json({ error: "申請の取得に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(request);
  if (!checkAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const parsed = ApplicationPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (body.cohortId) {
      const exists = await prisma.cohort.findUnique({ where: { id: body.cohortId }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: "cohortId が無効です" }, { status: 400 });
    }
    if (body.agentId) {
      const exists = await prisma.agent.findUnique({ where: { id: body.agentId }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: "agentId が無効です" }, { status: 400 });
    }

    const updateData: Prisma.ApplicationUpdateInput = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.adminMemo !== undefined) updateData.adminMemo = body.adminMemo;
    if (body.interviewDate !== undefined) updateData.interviewDate = body.interviewDate;
    if (body.interviewTime !== undefined) updateData.interviewTime = body.interviewTime;
    if (body.interviewPlace !== undefined) updateData.interviewPlace = body.interviewPlace;
    if (body.interviewNotes !== undefined) updateData.interviewNotes = body.interviewNotes;
    if (body.interviewEmailSent !== undefined) updateData.interviewEmailSent = body.interviewEmailSent;
    if (body.resultEmailSent !== undefined) updateData.resultEmailSent = body.resultEmailSent;
    if (body.agentId !== undefined) {
      updateData.agent = body.agentId ? { connect: { id: body.agentId } } : { disconnect: true };
    }
    if (body.cohortId !== undefined) {
      updateData.cohort = body.cohortId ? { connect: { id: body.cohortId } } : { disconnect: true };
    }
    if (body.examMode !== undefined) updateData.examMode = body.examMode;
    if (body.referrerName !== undefined) updateData.referrerName = body.referrerName;
    if (body.referrerType !== undefined) updateData.referrerType = body.referrerType;

    const includeFull = {
      documents: true,
      adminNotes: { orderBy: { createdAt: "desc" } },
      enrollmentProcedure: true,
      enrollmentSignature: true,
      agent: true,
      cohort: { select: { id: true, name: true } },
      applicationSchools: { orderBy: { priority: "asc" } },
    } as const;

    const application = await prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: params.id },
        data: updateData,
        include: includeFull,
      });

      if (body.status === "合格" || body.status === "補欠合格") {
        const existing = await tx.enrollmentProcedure.findUnique({
          where: { applicationId: params.id },
        });
        if (!existing) {
          const cohort = updated.cohort
            ? await tx.cohort.findUnique({ where: { id: updated.cohort.id } })
            : null;
          const defaultChecklist = JSON.stringify([
            { name: "入学誓約書", required: true, done: false },
            { name: "健康診断書", required: true, done: false },
            { name: "最終学歴証明書（原本）", required: true, done: false },
            { name: "パスポートコピー", required: true, done: false },
            { name: "在留カードコピー", required: false, done: false },
            { name: "証明写真（4枚）", required: true, done: false },
          ]);
          // 選考モード別の学費があれば、Application.examMode に対応する金額を採用
          let tuitionAmount = cohort?.defaultTuitionAmount ?? null;
          if (cohort?.examModeTuitionAmounts && updated.examMode) {
            try {
              const map = JSON.parse(cohort.examModeTuitionAmounts) as Record<string, string>;
              if (map[updated.examMode]) tuitionAmount = map[updated.examMode];
            } catch { /* ignore parse errors, fall back to default */ }
          }
          await tx.enrollmentProcedure.create({
            data: {
              applicationId: params.id,
              instructions:
                "おめでとうございます！入学手続きを以下の手順で完了してください。\n\n① 学費をお振込みください\n② 必要書類をアップロードしてください\n③ 入学誓約書に電子署名してください\n④ すべて完了したら「手続き完了を報告する」ボタンを押してください\n\nご不明な点は入学相談室（平日9:00〜17:00）までお問い合わせください。",
              status: "案内済み",
              publishedAt: new Date(),
              docChecklist: defaultChecklist,
              tuitionPlan: cohort?.defaultTuitionPlan ?? "全額",
              tuitionAmount,
              tuitionAmount2: cohort?.defaultTuitionAmount2 ?? null,
              tuitionBankInfo: cohort?.defaultTuitionBankInfo ?? null,
              step1Deadline: cohort?.defaultTuitionDeadline ?? null,
              tuitionDeadline2: cohort?.defaultTuitionDeadline2 ?? null,
              step2Deadline: cohort?.defaultStep2Deadline ?? null,
              step3Deadline: cohort?.defaultStep3Deadline ?? null,
            },
          });
        } else if (!existing.publishedAt) {
          await tx.enrollmentProcedure.update({
            where: { applicationId: params.id },
            data: { publishedAt: new Date(), status: "案内済み" },
          });
        }
      }

      if (body.addNote) {
        const user = session ? await tx.adminUser.findUnique({
          where: { id: session.userId },
          select: { displayName: true, username: true },
        }) : null;
        await tx.adminNote.create({
          data: {
            applicationId: params.id,
            content: body.addNote,
            author: user?.displayName || user?.username || "管理者",
            // フラグが明示的に true で来た時のみ学生公開。後方互換: 未指定は内部メモ。
            visibleToStudent: body.noteVisibleToStudent === true,
          },
        });
      }

      // 副作用（procedure 作成・note 追加）後の最新状態を返す
      return tx.application.findUnique({ where: { id: params.id }, include: includeFull });
    });

    return NextResponse.json(application);
  } catch (error) {
    logError("PATCH /api/applications/[id]", error);
    return NextResponse.json({ error: "申請の更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(request);
  try {
    if (!checkAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    await prisma.application.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("DELETE /api/applications/[id]", error);
    return NextResponse.json({ error: "申請の削除に失敗しました" }, { status: 500 });
  }
}
