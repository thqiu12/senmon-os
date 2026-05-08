import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";

// GET: 申請詳細取得（管理者 or 申請番号+メールで本人確認）
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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
        adminNotes: {
          orderBy: { createdAt: "desc" },
        },
        enrollmentProcedure: true,
        enrollmentSignature: true,
        agent: true,
        cohort: { select: { id: true, name: true } },
        applicationSchools: {
          orderBy: { priority: "asc" },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "申請が見つかりません" },
        { status: 404 }
      );
    }

    // 本人確認（管理者でない場合はメールアドレスで確認）
    if (!isAdmin) {
      if (!email || application.email !== email) {
        return NextResponse.json(
          { error: "アクセスが拒否されました" },
          { status: 403 }
        );
      }
      // 管理者向け情報を除去
      const {
        adminMemo: _memo,
        interviewEmailSent: _ies,
        resultEmailSent: _res,
        ...publicData
      } = application as typeof application & { adminMemo?: unknown; interviewEmailSent?: unknown; resultEmailSent?: unknown };
      return NextResponse.json(publicData);
    }

    return NextResponse.json(application);
  } catch (error) {
    console.error("GET /api/applications/[id] error:", error);
    return NextResponse.json(
      { error: "申請の取得に失敗しました" },
      { status: 500 }
    );
  }
}

// PATCH: 申請の更新（管理者のみ）
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  try {
    if (!checkAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const {
      status,
      adminMemo,
      addNote,
      // 面接フィールド
      interviewDate,
      interviewTime,
      interviewPlace,
      interviewNotes,
      interviewEmailSent,
      // 合否通知
      resultEmailSent,
      // エージェント
      agentId,
      // バッチ
      cohortId,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (adminMemo !== undefined) updateData.adminMemo = adminMemo;
    if (interviewDate !== undefined) updateData.interviewDate = interviewDate;
    if (interviewTime !== undefined) updateData.interviewTime = interviewTime;
    if (interviewPlace !== undefined) updateData.interviewPlace = interviewPlace;
    if (interviewNotes !== undefined) updateData.interviewNotes = interviewNotes;
    if (interviewEmailSent !== undefined) updateData.interviewEmailSent = interviewEmailSent;
    if (resultEmailSent !== undefined) updateData.resultEmailSent = resultEmailSent;
    if (agentId !== undefined) updateData.agentId = agentId === "" ? null : agentId;
    if (cohortId !== undefined) updateData.cohortId = cohortId === "" ? null : cohortId;
    if (body.examMode !== undefined) updateData.examMode = body.examMode;
    if (body.referrerName !== undefined) updateData.referrerName = body.referrerName;
    if (body.referrerType !== undefined) updateData.referrerType = body.referrerType;

    const application = await prisma.application.update({
      where: { id: params.id },
      data: updateData,
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

    // 合格・補欠合格になった場合、入学手続きを自動作成・公開
    if (status === "合格" || status === "補欠合格") {
      const existing = await prisma.enrollmentProcedure.findUnique({
        where: { applicationId: params.id },
      });
      if (!existing) {
        // 申請に紐づくCohortのデフォルト設定を取得
        const appWithCohort = await prisma.application.findUnique({
          where: { id: params.id },
          include: { cohort: true },
        });
        const cohort = appWithCohort?.cohort;

        const defaultChecklist = JSON.stringify([
          { name: "入学誓約書", required: true, done: false },
          { name: "健康診断書", required: true, done: false },
          { name: "最終学歴証明書（原本）", required: true, done: false },
          { name: "パスポートコピー", required: true, done: false },
          { name: "在留カードコピー", required: false, done: false },
          { name: "証明写真（4枚）", required: true, done: false },
        ]);
        await prisma.enrollmentProcedure.create({
          data: {
            applicationId: params.id,
            instructions: "おめでとうございます！入学手続きを以下の手順で完了してください。\n\n① 学費をお振込みください\n② 必要書類をアップロードしてください\n③ 入学誓約書に電子署名してください\n④ すべて完了したら「手続き完了を報告する」ボタンを押してください\n\nご不明な点は入学相談室（平日9:00〜17:00）までお問い合わせください。",
            status: "案内済み",
            publishedAt: new Date(),
            docChecklist: defaultChecklist,
            // Cohortのデフォルト設定を適用
            tuitionPlan:      cohort?.defaultTuitionPlan     ?? "全額",
            tuitionAmount:    cohort?.defaultTuitionAmount   ?? null,
            tuitionAmount2:   cohort?.defaultTuitionAmount2  ?? null,
            tuitionBankInfo:  cohort?.defaultTuitionBankInfo ?? null,
            step1Deadline:    cohort?.defaultTuitionDeadline ?? null,
            tuitionDeadline2: cohort?.defaultTuitionDeadline2 ?? null,
            step2Deadline:    cohort?.defaultStep2Deadline   ?? null,
            step3Deadline:    cohort?.defaultStep3Deadline   ?? null,
          },
        });
      } else if (!existing.publishedAt) {
        await prisma.enrollmentProcedure.update({
          where: { applicationId: params.id },
          data: { publishedAt: new Date(), status: "案内済み" },
        });
      }
    }

    // メモの追加
    if (addNote) {
      await prisma.adminNote.create({
        data: {
          applicationId: params.id,
          content: addNote,
          author: "管理者",
        },
      });
    }

    return NextResponse.json(application);
  } catch (error) {
    console.error("PATCH /api/applications/[id] error:", error);
    return NextResponse.json(
      { error: "申請の更新に失敗しました" },
      { status: 500 }
    );
  }
}

// DELETE: 申請の削除（管理者のみ）
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  try {
    if (!checkAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    await prisma.application.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/applications/[id] error:", error);
    return NextResponse.json(
      { error: "申請の削除に失敗しました" },
      { status: 500 }
    );
  }
}
