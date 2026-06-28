import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { ProspectCreateSchema } from "@/lib/schemas";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { logError } from "@/lib/logger";

/**
 * /api/prospects
 *  POST: エージェント（または admin）が希望者を登録
 *  GET : admin が一覧取得（フィルタ・ソート対応）
 */

export const POST = withTenant(async (request: NextRequest) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`prospect:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正な JSON" }, { status: 400 });
  }

  const parsed = ProspectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力エラー", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { agentId, formToken, ...rest } = parsed.data;

  try {
    const db = getTenantDb();
    const agent = await db.agent.findFirst({ where: { id: agentId } });
    if (!agent || !agent.isActive) {
      return NextResponse.json({ error: "エージェントが見つかりません" }, { status: 404 });
    }

    // 認証: admin セッション OR formToken 一致のいずれか必須
    const session = await getSession(request);
    const isAdminUser = isAdmin(session);
    if (!isAdminUser) {
      if (!agent.formToken || agent.formToken !== formToken) {
        return NextResponse.json(
          { error: "アクセス権限がありません（エージェント専用 URL から登録してください）" },
          { status: 403 },
        );
      }
    }

    const created = await db.prospect.create({
      data: {
        agentId,
        lastName: rest.lastName,
        firstName: rest.firstName,
        lastNameKana: rest.lastNameKana || null,
        firstNameKana: rest.firstNameKana || null,
        birthDate: rest.birthDate || null,
        gender: rest.gender || null,
        nationality: rest.nationality || null,
        // email は小文字化して保存（出願メールとの照合を case-insensitive にするため）
        email: rest.email ? rest.email.trim().toLowerCase() : null,
        phone: rest.phone || null,
        intendedSchool: rest.intendedSchool || null,
        intendedDepartment: rest.intendedDepartment || null,
        enrollmentYear: rest.enrollmentYear || null,
        enrollmentMonth: rest.enrollmentMonth || null,
        expectedApplyDate: rest.expectedApplyDate || null,
        agentNotes: rest.agentNotes || null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    logError("POST /api/prospects", e);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }
});

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const status = searchParams.get("status");
    const search = searchParams.get("q")?.trim();
    const orderBy = searchParams.get("orderBy") || "name"; // "name" | "createdAt"

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { lastName: { contains: search } },
        { firstName: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const rows = await getTenantDb().prospect.findMany({
      where,
      orderBy:
        orderBy === "name"
          ? [{ lastName: "asc" }, { firstName: "asc" }]
          : [{ createdAt: "desc" }],
      include: {
        agent: { select: { id: true, name: true, country: true } },
      },
    });
    return NextResponse.json(rows);
  } catch (e) {
    logError("GET /api/prospects", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});
