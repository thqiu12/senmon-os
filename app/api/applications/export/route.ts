import { NextRequest, NextResponse } from "next/server";
import { escapeCsv } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";
import { logError } from "@/lib/logger";
import { statusWhere } from "@/lib/schemas";
import {
  CSV_INCLUDE,
  resolveRow,
  sanitizeColumns,
  defaultColumns,
  customCsvColumns,
  type CsvApp,
  type ColRef,
} from "@/lib/csvColumns";

const PAGE_SIZE = 500;
const CSV_COLUMNS_KEY = "applications_csv_columns";

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!(await hasCapability(session, "data.export"))) {
    return NextResponse.json({ error: "エクスポートの権限がありません" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const where: Record<string, unknown> = { deletedAt: null };
    const sw = statusWhere(status);
    if (sw !== undefined) where.status = sw;
    // org スコープ済みクライアントを stream 構築前に捕捉(後で start が走っても org に束縛される)
    const db = getTenantDb();

    // 管理者が選択した出力列を解決(未設定なら現行 39 列)
    const settingRow = await db.systemSetting.findFirst({ where: { key: CSV_COLUMNS_KEY } });
    let columns: ColRef[];
    if (settingRow?.value) {
      const cfgRows = await db.formFieldConfig.findMany({
        select: { fieldKey: true, label: true, fieldType: true },
      });
      const customKeys = new Set(customCsvColumns(cfgRows).map((c) => c.key));
      try {
        columns = sanitizeColumns(JSON.parse(settingRow.value), customKeys);
      } catch {
        columns = defaultColumns();
      }
    } else {
      columns = defaultColumns();
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(
          enc.encode("﻿" + columns.map((c) => escapeCsv(c.label)).join(",") + "\n"),
        );

        let cursor: string | undefined = undefined;
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const batch: CsvApp[] = await db.application.findMany({
              where,
              orderBy: { id: "asc" },
              take: PAGE_SIZE,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
              include: CSV_INCLUDE,
            });
            if (batch.length === 0) break;

            for (const app of batch) {
              const row = resolveRow(
                app,
                columns,
                (app.extraData ?? null) as Record<string, unknown> | null,
              )
                .map(escapeCsv)
                .join(",");
              controller.enqueue(enc.encode(row + "\n"));
            }

            cursor = batch[batch.length - 1].id;
            if (batch.length < PAGE_SIZE) break;
          }
          controller.close();
        } catch (e) {
          logError("CSV stream failed", e);
          controller.error(e);
        }
      },
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="applications_${dateStr}.csv"`,
      },
    });
  } catch (error) {
    logError("GET /api/applications/export", error);
    return NextResponse.json({ error: "CSVエクスポートに失敗しました" }, { status: 500 });
  }
});
