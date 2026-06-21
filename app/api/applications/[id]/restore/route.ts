import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { logError } from "@/lib/logger";
import { getClientIp } from "@/lib/security";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

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
    const restored = await prisma.application.update({
      where: { id: params.id },
      data: { deletedAt: null, deletedBy: null, deleteReason: null },
    });
    const label = `${restored.applicationNo} ${restored.lastName}${restored.firstName}`.trim();
    await logAudit(session, {
      action: AUDIT_ACTIONS.APPLICATION_RESTORE,
      targetType: "Application", targetId: params.id, targetLabel: label,
      summary: `出願「${label}」を復元`,
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("POST /api/applications/[id]/restore", error);
    return NextResponse.json({ error: "復元に失敗しました" }, { status: 500 });
  }
}
