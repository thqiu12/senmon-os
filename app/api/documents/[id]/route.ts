import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";
import { logError } from "@/lib/logger";
import { z } from "zod";

const DocumentReviewSchema = z.object({
  status: z.enum(["提出済", "確認済", "差し戻し"]),
  rejectReason: z.string().max(1000).optional().nullable(),
});

export const PATCH = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!(await hasCapability(session, "document.review"))) {
    return NextResponse.json({ error: "書類審査の権限がありません" }, { status: 403 });
  }
  try {
    const parsed = DocumentReviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { status, rejectReason } = parsed.data;
    // 「差し戻し」には理由が必須
    if (status === "差し戻し" && !rejectReason?.trim()) {
      return NextResponse.json(
        { error: "差し戻しには理由が必要です" },
        { status: 400 },
      );
    }
    const db = getTenantDb();
    const reviewer = session
      ? await db.adminUser.findFirst({
          where: { id: session.userId },
          select: { displayName: true, username: true },
        })
      : null;
    const updated = await db.document.update({
      where: { id: params.id },
      data: {
        status,
        rejectReason: status === "差し戻し" ? rejectReason : null,
        reviewedAt: new Date(),
        reviewedBy: reviewer?.displayName || reviewer?.username || "管理者",
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    logError("PATCH /api/documents/[id]", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});
