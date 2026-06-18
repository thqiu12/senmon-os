import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

// 申請者が自己申告できるステータス（「振込済み」「確認済み」「免除」の確定は管理者のみ）
const STUDENT_SELF_REPORT_STATUS = new Set(["確認中", "未払い"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const application = await prisma.application.findUnique({
      where: { id },
      select: { id: true, applicationNo: true, email: true },
    });
    if (!application) {
      return NextResponse.json({ error: "出願が見つかりません" }, { status: 404 });
    }

    const session = await getSession(request);
    const admin = isAdmin(session);

    const body = await request.json();
    const { examFeeStatus, examFeeAmount, examFeeReceiptUrl, examFeeNote, applicationNo, email } = body;

    const data: Record<string, unknown> = {};

    if (admin) {
      // 管理者は全フィールドを設定可能（支払い確定を含む）
      if (examFeeStatus !== undefined) data.examFeeStatus = examFeeStatus;
      if (examFeeAmount !== undefined) data.examFeeAmount = examFeeAmount;
      if (examFeeReceiptUrl !== undefined) data.examFeeReceiptUrl = examFeeReceiptUrl;
      if (examFeeNote !== undefined) data.examFeeNote = examFeeNote;
    } else {
      // 申請者：申請番号 + メール + 対象IDを照合できた本人のみ自己申告可能。
      // 「確認済み」等の確定ステータスや管理メモは設定できない。
      if (!applicationNo || !email || application.applicationNo !== applicationNo || application.email !== email) {
        return NextResponse.json({ error: "アクセスが拒否されました" }, { status: 403 });
      }
      if (examFeeStatus !== undefined) {
        if (!STUDENT_SELF_REPORT_STATUS.has(examFeeStatus)) {
          return NextResponse.json(
            { error: "この支払いステータスは設定できません" },
            { status: 403 }
          );
        }
        data.examFeeStatus = examFeeStatus;
      }
      if (examFeeAmount !== undefined) data.examFeeAmount = examFeeAmount;
      if (examFeeReceiptUrl !== undefined) data.examFeeReceiptUrl = examFeeReceiptUrl;
    }

    const updated = await prisma.application.update({
      where: { id },
      data,
      select: { id: true, examFeeStatus: true, examFeeAmount: true, examFeeReceiptUrl: true },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/applications/[id]/fee error:", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
