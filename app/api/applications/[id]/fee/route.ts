import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

const ALLOWED_STATUSES = new Set(["未払い", "振込済み", "確認中", "確認済み"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { examFeeStatus, examFeeAmount, examFeeReceiptUrl, examFeeNote } = body;

    if (examFeeStatus !== undefined && !ALLOWED_STATUSES.has(examFeeStatus)) {
      return NextResponse.json({ error: "ステータスが不正です" }, { status: 400 });
    }
    if (examFeeAmount !== undefined && (typeof examFeeAmount !== "number" || examFeeAmount < 0)) {
      return NextResponse.json({ error: "金額が不正です" }, { status: 400 });
    }

    const updated = await prisma.application.update({
      where: { id: params.id },
      data: {
        ...(examFeeStatus !== undefined && { examFeeStatus }),
        ...(examFeeAmount !== undefined && { examFeeAmount }),
        ...(examFeeReceiptUrl !== undefined && { examFeeReceiptUrl }),
        ...(examFeeNote !== undefined && { examFeeNote }),
      },
      select: { id: true, examFeeStatus: true, examFeeAmount: true, examFeeReceiptUrl: true },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/applications/[id]/fee error:", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
