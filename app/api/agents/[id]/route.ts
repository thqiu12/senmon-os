import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";

// PATCH: エージェント更新
export const PATCH = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const session = await getSession(request);
  try {
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const body = await request.json();
    const { name, country, contactName, contactEmail, notes, isActive } = body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (country !== undefined) data.country = country;
    if (contactName !== undefined) data.contactName = contactName;
    if (contactEmail !== undefined) data.contactEmail = contactEmail;
    if (notes !== undefined) data.notes = notes;
    if (isActive !== undefined) data.isActive = isActive;

    const agent = await getTenantDb().agent.update({ where: { id: params.id }, data });
    return NextResponse.json({ success: true, agent });
  } catch (error) {
    console.error("PATCH /api/agents/[id] error:", error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});

// DELETE: エージェント削除
export const DELETE = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const session = await getSession(request);
  try {
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const db = getTenantDb();
    // 申請が紐づいていたら agentId を null に
    await db.application.updateMany({
      where: { agentId: params.id },
      data: { agentId: null },
    });
    await db.agent.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/agents/[id] error:", error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
});
