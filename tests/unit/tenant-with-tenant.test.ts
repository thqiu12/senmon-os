import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant/with-tenant";
import { currentOrgId } from "@/lib/tenant/context";
import { getTenantDb } from "@/lib/tenant/scoped";

const mockReq = (host: string) =>
  ({
    cookies: { get: () => undefined }, // 未ログイン
    headers: { get: (k: string) => (k.toLowerCase() === "host" ? host : null) },
  }) as any;

describe("withTenant", () => {
  let defaultOrg = "";
  beforeAll(async () => {
    defaultOrg = (
      await prisma.organization.upsert({
        where: { slug: "chinichi" },
        update: {},
        create: { name: "知日グループ", slug: "chinichi" },
      })
    ).id;
  });

  it("ハンドラ内で org 文脈が確立し getTenantDb が使える", async () => {
    let seenOrg: string | null = null;
    let createdOrg: string | null = null;
    const handler = withTenant(async () => {
      seenOrg = currentOrgId();
      const a = await getTenantDb().agent.create({ data: { name: "viaWrapper" } });
      createdOrg = a.organizationId;
      return new Response("ok");
    });
    const res = await handler(mockReq("unknown.example.com"), {});
    expect((res as Response).status).toBe(200);
    expect(seenOrg).toBe(defaultOrg); // 未ログイン → 既定 org
    expect(createdOrg).toBe(defaultOrg); // create も自動で org 付与
  });
});
