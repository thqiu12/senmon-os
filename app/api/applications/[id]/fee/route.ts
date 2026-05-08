import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { examFeeStatus, examFeeAmount, examFeeReceiptUrl, examFeeNote } = body;

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
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
