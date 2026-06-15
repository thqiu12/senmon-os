import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { logError } from "@/lib/logger";

// 論理削除（ゴミ箱）された出願を復元する。
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(request);
  try {
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!(await hasCapability(session, "application.delete"))) {
      return NextResponse.json({ error: "復元する権限がありません" }, { status: 403 });
    }
    await prisma.application.update({
      where: { id: params.id },
      data: { deletedAt: null, deletedBy: null, deleteReason: null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("POST /api/applications/[id]/restore", error);
    return NextResponse.json({ error: "復元に失敗しました" }, { status: 500 });
  }
}
