import { NextRequest, NextResponse } from "next/server";
import { getSession, isCoreAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import {
  BUILTIN_CSV_COLUMNS,
  customCsvColumns,
  sanitizeColumns,
  defaultColumns,
} from "@/lib/csvColumns";

// CSV出力項目の選択を SystemSetting に保存/取得する。
// key=applications_csv_columns に ColRef[] を JSON で保存。
// 全体共有の設定のため、支払い設定(payment-config)と同様 isCoreAdmin のみ編集可。
// （data.export は sales も持つため、共有設定の改変を防ぐ意図）
const CSV_COLUMNS_KEY = "applications_csv_columns";

async function guard(request: NextRequest) {
  const session = await getSession(request);
  if (!session)
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  if (!isCoreAdmin(session))
    return {
      error: NextResponse.json({ error: "権限がありません" }, { status: 403 }),
    };
  return { session };
}

export const GET = withTenant(async (request: NextRequest) => {
  const g = await guard(request);
  if (g.error) return g.error;
  const db = getTenantDb();
  const configs = await db.formFieldConfig.findMany({
    select: { fieldKey: true, label: true, fieldType: true },
  });
  const custom = customCsvColumns(configs);
  const customKeys = new Set(custom.map((c) => c.key));
  const row = await db.systemSetting.findFirst({ where: { key: CSV_COLUMNS_KEY } });
  let selected;
  if (row?.value) {
    try {
      selected = sanitizeColumns(JSON.parse(row.value), customKeys);
    } catch {
      selected = defaultColumns();
    }
  } else {
    selected = defaultColumns();
  }
  return NextResponse.json({
    selected,
    available: {
      builtin: BUILTIN_CSV_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
      custom,
    },
  });
});

export const PUT = withTenant(async (request: NextRequest) => {
  const g = await guard(request);
  if (g.error) return g.error;
  const session = g.session!;
  const db = getTenantDb();
  const body = await request.json().catch(() => ({}));
  const configs = await db.formFieldConfig.findMany({
    select: { fieldKey: true, label: true, fieldType: true },
  });
  const customKeys = new Set(customCsvColumns(configs).map((c) => c.key));
  const columns = sanitizeColumns(body?.columns, customKeys);
  const value = JSON.stringify(columns);
  await db.systemSetting.upsert({
    where: { key: CSV_COLUMNS_KEY },
    update: { value, updatedBy: session.userId },
    create: { key: CSV_COLUMNS_KEY, value, updatedBy: session.userId },
  });
  return NextResponse.json({ selected: columns });
});
