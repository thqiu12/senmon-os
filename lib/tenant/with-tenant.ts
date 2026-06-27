/**
 * ルートハンドラを org 文脈で包むラッパ(Plan 2 Phase F の機構)。
 *
 *   export const GET = withTenant(async (req) => {
 *     const session = await getSession(req);     // 認証/認可は従来どおり各ハンドラで
 *     if (!isAdmin(session)) return 403;
 *     const db = getTenantDb();                  // 文脈の org にスコープ済み
 *     return NextResponse.json(await db.application.findMany());
 *   });
 *
 * - org 解決: ログイン user の organizationId(最優先)→ host → 既定 org。
 * - 認証は本ラッパでは行わない(org 文脈の確立のみ)。各ハンドラの authz はそのまま。
 * - 解決できなければ 400(設定不全)。AsyncLocalStorage は await をまたいで伝播する。
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveOrgId } from "./resolve";
import { runWithTenant } from "./context";

type RouteHandler = (req: NextRequest, ctx: any) => Promise<Response> | Response;

export function withTenant(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const session = await getSession(req);
    const orgId = await resolveOrgId(req, session);
    if (!orgId) {
      return NextResponse.json({ error: "テナントを解決できません" }, { status: 400 });
    }
    return runWithTenant(
      { organizationId: orgId, isPlatform: session?.isPlatformAdmin === true },
      () => handler(req, ctx),
    );
  };
}
