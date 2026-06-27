/**
 * リクエスト → Organization 解決。
 *   1) ログイン済みなら session の organizationId(最優先)
 *   2) host から(サブドメイン {slug}.<ROOT> / カスタムドメイン)
 *   3) フォールバック: 既定 org(単一テナント運用。DEFAULT_ORG_SLUG, 既定 "chinichi")
 *
 * 見つかった org のみ短期キャッシュ(ミスはキャッシュしない=作成直後も拾える)。
 */
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";

const DEFAULT_SLUG = process.env.DEFAULT_ORG_SLUG || "chinichi";
const ROOT = process.env.TENANT_ROOT_DOMAIN || ""; // 例 "compass.app"。未設定ならサブドメイン解決しない
const TTL = 60_000;
const cache = new Map<string, { id: string; at: number }>();

async function lookup(key: string, find: () => Promise<{ id: string } | null>): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.id;
  const org = await find();
  if (org) cache.set(key, { id: org.id, at: Date.now() });
  return org?.id ?? null;
}

const orgIdBySlug = (slug: string) =>
  lookup(`slug:${slug}`, () => prisma.organization.findUnique({ where: { slug }, select: { id: true } }));
const orgIdByDomain = (host: string) =>
  lookup(`dom:${host}`, () => prisma.organization.findUnique({ where: { customDomain: host }, select: { id: true } }));

export async function resolveOrgId(
  request: NextRequest,
  session?: AdminSession | null,
): Promise<string | null> {
  if (session?.organizationId) return session.organizationId;

  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host) {
    if (ROOT && host.endsWith(`.${ROOT}`)) {
      const id = await orgIdBySlug(host.slice(0, -(`.${ROOT}`.length)));
      if (id) return id;
    } else {
      const id = await orgIdByDomain(host);
      if (id) return id;
    }
  }
  return orgIdBySlug(DEFAULT_SLUG);
}
