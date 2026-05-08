import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, verifyStudentOwnership } from "@/lib/auth";

// GET: 入学手続き情報取得
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
      // 学生本人確認（大文字小文字を区別しない）
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) {
        return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
      }
      procedure = await prisma.enrollmentProcedure.findUnique({ where: { applicationId: ownership.applicationId } });
    } else {
      return NextResponse.json({ error: "emailパラメータが必要です" }, { status: 400 });
    }

    return NextResponse.json({ procedure: procedure || null });
  } catch (error) {
    console.error("GET /api/enrollment error:", error);
    return NextResponse.json({ error: "入学手続き情報の取得に失敗しました" }, { status: 500 });
  }
}

// POST: 入学手続き情報の作成・更新（管理者のみ）
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  try {
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const {
      applicationId, instructions, deadline, publish,
      // ステップ別締切
      step1Deadline, step2Deadline, step3Deadline,
      // 学費
      tuitionPlan, tuitionPaid, tuitionPaidAt, tuitionAmount,
      tuitionAmount2, tuitionDeadline2, tuitionBankInfo,
      // 書類
      docSubmitted, docSubmittedAt, docChecklist,
      // ビザ
      visaStatus, visaNote,
      // 寮
      dormApply, dormStatus, dormNote,
      // 管理メモ
      adminNote,
    } = body;

    if (!applicationId) {
      return NextResponse.json({ error: "applicationIdが必要です" }, { status: 400 });
    }

    const data: Record<string, unknown> = {
      instructions: instructions ?? undefined,
      deadline: deadline ?? undefined,
    };

    if (publish) {
      data.publishedAt = new Date();
      data.status = "案内済み";
    }

    // ステップ別締切
    if (step1Deadline !== undefined) data.step1Deadline = step1Deadline;
    if (step2Deadline !== undefined) data.step2Deadline = step2Deadline;
    if (step3Deadline !== undefined) data.step3Deadline = step3Deadline;

    // 学費
    if (tuitionPlan !== undefined) data.tuitionPlan = tuitionPlan;
    if (tuitionPaid !== undefined) data.tuitionPaid = tuitionPaid;
    if (tuitionPaidAt !== undefined) data.tuitionPaidAt = tuitionPaidAt ? new Date(tuitionPaidAt) : null;
    if (tuitionAmount !== undefined) data.tuitionAmount = tuitionAmount;
    if (tuitionAmount2 !== undefined) data.tuitionAmount2 = tuitionAmount2;
    if (tuitionDeadline2 !== undefined) data.tuitionDeadline2 = tuitionDeadline2;
    if (tuitionBankInfo !== undefined) data.tuitionBankInfo = tuitionBankInfo;

    // 書類
    if (docSubmitted !== undefined) data.docSubmitted = docSubmitted;
    if (docSubmittedAt !== undefined) data.docSubmittedAt = docSubmittedAt ? new Date(docSubmittedAt) : null;
    if (docChecklist !== undefined) data.docChecklist = typeof docChecklist === "string" ? docChecklist : JSON.stringify(docChecklist);

    // ビザ
    if (visaStatus !== undefined) data.visaStatus = visaStatus;
    if (visaNote !== undefined) data.visaNote = visaNote;

    // 寮
    if (dormApply !== undefined) data.dormApply = dormApply;
    if (dormStatus !== undefined) data.dormStatus = dormStatus;
    if (dormNote !== undefined) data.dormNote = dormNote;

    // 管理メモ
    if (adminNote !== undefined) data.adminNote = adminNote;

    const procedure = await prisma.enrollmentProcedure.upsert({
      where: { applicationId },
      create: {
        applicationId,
        ...data,
        status: publish ? "案内済み" : "未開始",
      },
      update: data,
    });

    return NextResponse.json({ success: true, procedure });
  } catch (error) {
    console.error("POST /api/enrollment error:", error);
    return NextResponse.json({ error: "入学手続き情報の保存に失敗しました" }, { status: 500 });
  }
}

// PATCH: 学生からの手続き完了報告
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { applicationNo, email, studentMemo, markComplete } = body;

    if (!applicationNo || !email) {
      return NextResponse.json({ error: "applicationNoとemailが必要です" }, { status: 400 });
    }

    // 学生本人確認
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
    console.error("PATCH /api/enrollment error:", error);
    return NextResponse.json({ error: "手続き情報の更新に失敗しました" }, { status: 500 });
  }
}
