import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { ProspectAdminPatchSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";

/**
 * /api/prospects/[id]
 *  PATCH : admin が status / メモ / 手動マッチを更新
 *  DELETE: admin が削除
 */

export const PATCH = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正な JSON" }, { status: 400 });
  }

  const parsed = ProspectAdminPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力エラー", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const db = getTenantDb();
    const me = session
      ? await db.adminUser.findFirst({
          where: { id: session.userId },
          select: { displayName: true, username: true },
        })
      : null;
    const reviewer = me?.displayName || me?.username || "管理者";

    const updateData: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.adminMemo !== undefined) updateData.adminMemo = parsed.data.adminMemo || null;

    // 手動マッチ: matchedApplicationId を変更時
    if (parsed.data.matchedApplicationId !== undefined) {
      const newAppId = parsed.data.matchedApplicationId || null;
      if (newAppId) {
        const app = await db.application.findFirst({ where: { id: newAppId } });
        if (!app) {
          return NextResponse.json({ error: "申請 ID が存在しません" }, { status: 400 });
        }
        // 既に他の Prospect とマッチしていないか
        const existing = await db.prospect.findFirst({
          where: { matchedApplicationId: newAppId, id: { not: params.id } },
        });
        if (existing) {
          return NextResponse.json(
            { error: `この申請は既に別の希望者と紐付いています (Prospect #${existing.id.slice(0, 8)})` },
            { status: 409 },
          );
        }
        updateData.matchedApplicationId = newAppId;
        updateData.matchedAt = new Date();
        updateData.matchedBy = reviewer;

        // Application.agentId も同期更新
        const prospect = await db.prospect.findFirst({ where: { id: params.id } });
        if (prospect) {
          await db.application.update({
            where: { id: newAppId },
            data: { agentId: prospect.agentId },
          });
        }
      } else {
        // 紐付け解除
        updateData.matchedApplicationId = null;
        updateData.matchedAt = null;
        updateData.matchedBy = null;
      }
    }

    const updated = await db.prospect.update({
      where: { id: params.id },
      data: updateData,
      include: { agent: { select: { name: true } } },
    });
    return NextResponse.json(updated);
  } catch (e) {
    logError("PATCH /api/prospects/[id]", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});

export const DELETE = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    await getTenantDb().prospect.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    logError("DELETE /api/prospects/[id]", e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
});
