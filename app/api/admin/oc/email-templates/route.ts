import { NextRequest, NextResponse } from "next/server";
import { getSession, isCoreAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { OC_EMAIL_SETTING_KEY, parseTemplates, sanitizeTemplates } from "@/lib/ocEmailTemplates";

async function guard(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  if (!isCoreAdmin(session)) return { error: NextResponse.json({ error: "権限がありません" }, { status: 403 }) };
  return { session };
}

export const GET = withTenant(async (request: NextRequest) => {
  const g = await guard(request);
  if (g.error) return g.error;
  const row = await getTenantDb().systemSetting.findFirst({ where: { key: OC_EMAIL_SETTING_KEY } });
  return NextResponse.json({ templates: parseTemplates(row?.value ?? null) });
});

export const PUT = withTenant(async (request: NextRequest) => {
  const g = await guard(request);
  if (g.error) return g.error;
  const session = g.session!;
  const body = await request.json().catch(() => ({}));
  const templates = sanitizeTemplates(body?.templates);
  const value = JSON.stringify(templates);
  await getTenantDb().systemSetting.upsert({
    where: { key: OC_EMAIL_SETTING_KEY },
    update: { value, updatedBy: session.userId },
    create: { key: OC_EMAIL_SETTING_KEY, value, updatedBy: session.userId },
  });
  return NextResponse.json({ templates });
});
