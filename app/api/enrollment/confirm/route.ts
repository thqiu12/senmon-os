import { getSession } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/security";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// POST: 管理者が入学手続きを確認・承認する
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  try {
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!(await hasCapability(session, "enrollment.manage"))) {
      return NextResponse.json({ error: "入学手続きを管理する権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const {
      applicationId,
      action, // "confirm" | "issue_permit" | "notify_ceremony" | "notify_visa"
      ceremonyDate,
      ceremonyPlace,
      ceremonyNotes,
      visaGuideNotes,
    } = body;

    if (!applicationId || !action) {
      return NextResponse.json({ error: "パラメータが不足しています" }, { status: 400 });
    }

    const procedure = await prisma.enrollmentProcedure.findUnique({
      where: { applicationId },
      include: { application: true },
    });

    if (!procedure) {
      return NextResponse.json({ error: "入学手続き情報が見つかりません" }, { status: 404 });
    }

    let updateData: Record<string, unknown> = {};
    const operator = session?.userId ?? "管理者";

    if (action === "confirm") {
      // 一括: 学校承認 + 入学許可書発行（旧フロー互換）
      updateData = {
        schoolConfirmed: true,
        schoolConfirmedAt: new Date(),
        schoolConfirmedBy: operator,
        admitLetterIssued: true,
        admitLetterIssuedAt: new Date(),
        status: "許可書発行済み",
      };
    } else if (action === "schoolConfirm") {
      updateData = {
        schoolConfirmed: true,
        schoolConfirmedAt: new Date(),
        schoolConfirmedBy: operator,
      };
    } else if (action === "admitLetter") {
      updateData = {
        admitLetterIssued: true,
        admitLetterIssuedAt: new Date(),
        status: "許可書発行済み",
      };
    } else if (action === "notify_ceremony") {
      updateData = {
        ceremonyNotified: true,
        ceremonyDate: ceremonyDate || null,
        ceremonyPlace: ceremonyPlace || null,
        ceremonyNotes: ceremonyNotes || null,
      };
    } else if (action === "notify_visa") {
      updateData = {
        visaGuideNotified: true,
        visaGuideNotes: visaGuideNotes || null,
      };
    } else {
      return NextResponse.json({ error: "無効なアクション" }, { status: 400 });
    }

    const updated = await prisma.enrollmentProcedure.update({
      where: { applicationId },
      data: updateData,
    });

    const verbMap: Record<string, string> = {
      confirm: "校方確認・許可書発行",
      schoolConfirm: "校方確認",
      admitLetter: "入学許可書発行",
      notify_ceremony: "入学式案内",
      notify_visa: "ビザ案内",
    };
    const a = procedure.application;
    const label = `${a?.applicationNo ?? applicationId} ${a?.lastName ?? ""}${a?.firstName ?? ""}`.trim();
    await logAudit(session, {
      action: AUDIT_ACTIONS.ENROLLMENT_CONFIRM,
      targetType: "Application", targetId: applicationId, targetLabel: label,
      summary: `入学手続き（${label}）: ${verbMap[action as string] ?? action}`,
      meta: { action },
      ip: getClientIp(request),
    });

    return NextResponse.json({ success: true, procedure: updated });
  } catch (error) {
    console.error("POST /api/enrollment/confirm error:", error);
    return NextResponse.json({ error: "確認処理に失敗しました" }, { status: 500 });
  }
}
