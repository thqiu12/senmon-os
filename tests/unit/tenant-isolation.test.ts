import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { tenantPrisma } from "@/lib/tenant/prisma-tenant";

// テナント隔離の回帰防止(CI 必須)。A は B のデータを一切 読/改/消 できないこと。
describe("tenant isolation", () => {
  let orgA = "", orgB = "";
  let agentBId = "";

  beforeAll(async () => {
    const p = `${process.pid}-${Date.now()}`;
    orgA = (await prisma.organization.create({ data: { name: "A", slug: `a-${p}` } })).id;
    orgB = (await prisma.organization.create({ data: { name: "B", slug: `b-${p}` } })).id;
    await tenantPrisma(orgA).agent.create({ data: { name: "agentA" } });
    agentBId = (await tenantPrisma(orgB).agent.create({ data: { name: "agentB" } })).id;
  });

  it("create は自動で organizationId を付ける", async () => {
    const a = await tenantPrisma(orgA).agent.create({ data: { name: "x" } });
    expect(a.organizationId).toBe(orgA);
  });

  it("findMany は自テナントの行しか返さない", async () => {
    const rows = await tenantPrisma(orgA).agent.findMany();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.name === "agentB")).toBe(false);
  });

  it("count も自テナントのみ", async () => {
    const cA = await tenantPrisma(orgA).agent.count();
    const cB = await tenantPrisma(orgB).agent.count();
    expect(cA).toBeGreaterThanOrEqual(2);
    expect(cB).toBe(1);
  });

  it("findUnique で他テナントの行は null", async () => {
    const viaB = await tenantPrisma(orgB).agent.findUnique({ where: { id: agentBId } });
    expect(viaB?.id).toBe(agentBId); // 自テナントは見える
    const viaA = await tenantPrisma(orgA).agent.findUnique({ where: { id: agentBId } });
    expect(viaA).toBeNull(); // 他テナントは見えない
  });

  it("updateMany は他テナント行を更新しない(count 0)", async () => {
    const r = await tenantPrisma(orgA).agent.updateMany({ where: { id: agentBId }, data: { name: "hacked" } });
    expect(r.count).toBe(0);
    const b = await prisma.agent.findUnique({ where: { id: agentBId } });
    expect(b?.name).toBe("agentB"); // 変わっていない
  });

  it("update(単一)で他テナント行は Record not found", async () => {
    await expect(
      tenantPrisma(orgA).agent.update({ where: { id: agentBId }, data: { name: "hacked" } }),
    ).rejects.toThrow();
    const b = await prisma.agent.findUnique({ where: { id: agentBId } });
    expect(b?.name).toBe("agentB");
  });

  it("delete(単一)で他テナント行は Record not found", async () => {
    await expect(
      tenantPrisma(orgA).agent.delete({ where: { id: agentBId } }),
    ).rejects.toThrow();
    expect(await prisma.agent.findUnique({ where: { id: agentBId } })).not.toBeNull();
  });
});
