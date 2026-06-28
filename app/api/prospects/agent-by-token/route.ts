import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { checkRateLimit, getClientIp } from "@/lib/security";

/**
 * GET /api/prospects/agent-by-token?token=xxx
 *
 * エージェント専用フォーム ( /prospects/new?token=xxx ) のための公開エンドポイント。
 * トークンに対応するエージェント情報（id + name）だけを返す。
 * トークン不正なら 404。contactEmail 等の機密は返さない。
 */
export const GET = withTenant(async (request: NextRequest) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`prospect-token:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "トークンが不正です" }, { status: 400 });
  }

  const agent = await getTenantDb().agent.findFirst({
    where: { formToken: token },
    select: { id: true, name: true, isActive: true },
  });
  if (!agent || !agent.isActive) {
    return NextResponse.json({ error: "エージェントが見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ id: agent.id, name: agent.name });
});
