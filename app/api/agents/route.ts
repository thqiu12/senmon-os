import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { AgentCreateSchema, AgentPatchSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const agents = await getTenantDb().agent.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { applications: true } } },
    });
    return NextResponse.json(agents);
  } catch (e) {
    logError("GET /api/agents", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const parsed = AgentCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const agent = await getTenantDb().agent.create({ data: parsed.data });
    return NextResponse.json(agent, { status: 201 });
  } catch (e) {
    logError("POST /api/agents", e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
});

export const PATCH = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const parsed = AgentPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const agent = await getTenantDb().agent.update({ where: { id }, data: parsed.data });
    return NextResponse.json(agent);
  } catch (e) {
    logError("PATCH /api/agents", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});

export const DELETE = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    await getTenantDb().agent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    logError("DELETE /api/agents", e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
});
