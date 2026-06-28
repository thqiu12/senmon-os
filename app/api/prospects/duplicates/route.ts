import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { findDuplicateProspects } from "@/lib/match-prospect";
import { logError } from "@/lib/logger";

/**
 * GET /api/prospects/duplicates
 * 複数のエージェントから同じ学生が登録された重複を検出。
 * 名前のアルファベット順にソートされたグループを返す。
 *
 * findDuplicateProspects は getTenantDb()（organizationId スコープ）を使うため、
 * withTenant 文脈内で呼ぶ必要がある。
 */
export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    const groups = await findDuplicateProspects();
    return NextResponse.json({ groups });
  } catch (e) {
    logError("GET /api/prospects/duplicates", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});
