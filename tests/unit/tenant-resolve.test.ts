import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveOrgId } from "@/lib/tenant/resolve";

const req = (host?: string) =>
  ({ headers: { get: (k: string) => (k.toLowerCase() === "host" ? host ?? null : null) } }) as any;

describe("resolveOrgId", () => {
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

  it("ログイン済みは session の org を最優先(DB 不要)", async () => {
    const id = await resolveOrgId(req("whatever.example.com"), {
      userId: "u", role: "admin", isValid: true, organizationId: "org_session",
    });
    expect(id).toBe("org_session");
  });

  it("未ログイン・未知 host は既定 org にフォールバック", async () => {
    const id = await resolveOrgId(req("unknown.example.com"), null);
    expect(id).toBe(defaultOrg);
  });

  it("カスタムドメイン一致でその org を返す", async () => {
    const o = await prisma.organization.create({
      data: { name: "X校", slug: `x-${process.pid}`, customDomain: `apply.x-${process.pid}.ac.jp` },
    });
    const id = await resolveOrgId(req(`apply.x-${process.pid}.ac.jp`), null);
    expect(id).toBe(o.id);
  });
});
