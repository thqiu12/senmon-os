import { NextRequest, NextResponse } from "next/server";
import { getSession, isCoreAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import {
  PAYMENT_CONFIG_KEY,
  parsePaymentMap,
  sanitizeMap,
} from "@/lib/paymentConfig";

// 受験料・学費の支払い設定（学校別）。SystemSetting に { [schoolKey]: PaymentConfig } で保存。
// "__global__" は全校共通。QRはデータURIで保存（画像配信不要・デプロイ安全）。
// ⚠️ SystemSetting.key はグローバル @unique のため、真の多テナント化では
//    @@unique([organizationId, key]) への移行が必要（lib/settings 含め後続課題）。単一組織では問題なし。

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!session || !isCoreAdmin(session)) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  const row = await getTenantDb().systemSetting.findFirst({ where: { key: PAYMENT_CONFIG_KEY } });
  return NextResponse.json(parsePaymentMap(row?.value));
});

// 学校別マップを丸ごと保存（panel が全マップを保持して PUT する）。
export const PUT = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!session || !isCoreAdmin(session)) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const map = sanitizeMap(body);
  await getTenantDb().systemSetting.upsert({
    where: { key: PAYMENT_CONFIG_KEY },
    update: { value: JSON.stringify(map), updatedBy: session.userId },
    create: { key: PAYMENT_CONFIG_KEY, value: JSON.stringify(map), updatedBy: session.userId },
  });
  return NextResponse.json(map);
});
