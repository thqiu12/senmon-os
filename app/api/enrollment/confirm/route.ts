import { getSession, isAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST: 管理者が入学手続きを確認・承認する
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  try {
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
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

    if (action === "confirm") {
      // 学校承認完了 → 入学許可書発行へ進む
      updateData = {
        schoolConfirmed: true,
        schoolConfirmedAt: new Date(),
        schoolConfirmedBy: "管理者",
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

    return NextResponse.json({ success: true, procedure: updated });
  } catch (error) {
    console.error("POST /api/enrollment/confirm error:", error);
    return NextResponse.json({ error: "確認処理に失敗しました" }, { status: 500 });
  }
}
