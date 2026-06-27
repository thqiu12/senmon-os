import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { logError } from "@/lib/logger";

/**
 * POST /api/agents/:id/form-token
 * エージェント専用フォーム URL のトークンを (再) 発行する。
 * - 既存トークンは上書き（古い URL は無効化）
 * - トークンは 32 byte の hex 文字列
 */
export const POST = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const token = randomBytes(24).toString("hex");
    const agent = await getTenantDb().agent.update({
      where: { id: params.id },
      data: { formToken: token },
      select: { id: true, name: true, formToken: true },
    });
    return NextResponse.json(agent);
  } catch (e) {
    logError("POST /api/agents/[id]/form-token", e);
    return NextResponse.json({ error: "トークン生成に失敗しました" }, { status: 500 });
  }
});

/**
 * DELETE /api/agents/:id/form-token
 * トークンを無効化する（フォーム URL を使えなくする）。
 */
export const DELETE = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    await getTenantDb().agent.update({
      where: { id: params.id },
      data: { formToken: null },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    logError("DELETE /api/agents/[id]/form-token", e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
});
