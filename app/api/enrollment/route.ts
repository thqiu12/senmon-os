import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, verifyStudentOwnership } from "@/lib/auth";
import { EnrollmentUpsertSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";
import { getClientIp } from "@/lib/security";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get("applicationId");
    const applicationNo = searchParams.get("applicationNo");
    const email = searchParams.get("email");

    if (!applicationId && !applicationNo) {
      return NextResponse.json({ error: "applicationIdまたはapplicationNoが必要です" }, { status: 400 });
    }

    const session = await getSession(request);
    const adminAccess = isAdmin(session);

    let procedure;
    if (applicationId) {
      if (!adminAccess) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      procedure = await prisma.enrollmentProcedure.findUnique({ where: { applicationId } });
    } else if (applicationNo && email) {
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) {
        return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
      }
      procedure = await prisma.enrollmentProcedure.findUnique({
        where: { applicationId: ownership.applicationId },
      });
    } else {
      return NextResponse.json({ error: "emailパラメータが必要です" }, { status: 400 });
    }

    return NextResponse.json({ procedure: procedure || null });
  } catch (error) {
    logError("GET /api/enrollment", error);
    return NextResponse.json({ error: "入学手続き情報の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const parsed = EnrollmentUpsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { applicationId, publish, docChecklist, tuitionPaidAt, docSubmittedAt, ...rest } =
      parsed.data;

    const data: Record<string, unknown> = { ...rest };
    if (publish) {
      data.publishedAt = new Date();
      data.status = "案内済み";
    }
    if (tuitionPaidAt !== undefined) {
      data.tuitionPaidAt = tuitionPaidAt ? new Date(tuitionPaidAt) : null;
    }
    if (docSubmittedAt !== undefined) {
      data.docSubmittedAt = docSubmittedAt ? new Date(docSubmittedAt) : null;
    }
    if (docChecklist !== undefined) {
      data.docChecklist = typeof docChecklist === "string" ? docChecklist : JSON.stringify(docChecklist);
    }

    const procedure = await prisma.enrollmentProcedure.upsert({
      where: { applicationId },
      create: {
        applicationId,
        ...data,
        status: publish ? "案内済み" : "未開始",
      },
      update: data,
    });

    // 操作ログ（管理側）。公開 / 学費確認 / それ以外の更新で出し分ける。
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { applicationNo: true, lastName: true, firstName: true },
    });
    const label = `${app?.applicationNo ?? applicationId} ${app?.lastName ?? ""}${app?.firstName ?? ""}`.trim();
    const action = publish
      ? AUDIT_ACTIONS.ENROLLMENT_PUBLISH
      : rest.tuitionPaid === true
        ? AUDIT_ACTIONS.ENROLLMENT_TUITION
        : AUDIT_ACTIONS.ENROLLMENT_UPDATE;
    const verb = publish ? "公開" : rest.tuitionPaid === true ? "学費入金を確認" : "更新";
    await logAudit(session, {
      action,
      targetType: "Application", targetId: applicationId, targetLabel: label,
      summary: `入学手続き（${label}）を${verb}`,
      ip: getClientIp(request),
    });

    return NextResponse.json({ success: true, procedure });
  } catch (error) {
    logError("POST /api/enrollment", error);
    return NextResponse.json({ error: "入学手続き情報の保存に失敗しました" }, { status: 500 });
  }
}

const StudentReportSchema = z.object({
  applicationNo: z.string().min(1).max(50),
  email: z.string().email().max(254),
  studentMemo: z.string().max(2000).optional(),
  markComplete: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const parsed = StudentReportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { applicationNo, email, studentMemo, markComplete } = parsed.data;

    const ownership = await verifyStudentOwnership(applicationNo, email);
    if (!ownership.valid) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    const app = await prisma.application.findUnique({
      where: { id: ownership.applicationId },
      include: { enrollmentProcedure: true },
    });

    if (!app?.enrollmentProcedure) {
      return NextResponse.json({ error: "入学手続き情報が存在しません" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (studentMemo !== undefined) updateData.studentMemo = studentMemo;
    if (markComplete) {
      updateData.completedAt = new Date();
      updateData.status = "完了";
    }

    const procedure = await prisma.enrollmentProcedure.update({
      where: { applicationId: app.id },
      data: updateData,
    });

    return NextResponse.json({ success: true, procedure });
  } catch (error) {
    logError("PATCH /api/enrollment", error);
    return NextResponse.json({ error: "手続き情報の更新に失敗しました" }, { status: 500 });
  }
}
