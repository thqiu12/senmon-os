import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";

// 指定 OC イベントの予約一覧（JSON / CSV）+ 予約ステータス更新。
// 認可: 管理者（isAdmin）+ form.edit ケイパビリティ。

const RES_STATUSES = ["予約", "出席", "欠席", "キャンセル"] as const;

const StatusPatchSchema = z.object({
  id: z.string().min(1, "idは必須です"),
  status: z.enum(RES_STATUSES),
});

// CSV セルのエスケープ（先頭の数式文字も無害化）。
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "オープンキャンパスを編集する権限がありません" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventIdは必須です" }, { status: 400 });
    }
    const format = searchParams.get("format");

    const reservations = await getTenantDb().oCReservation.findMany({
      where: { ocEventId: eventId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        reservationNo: true,
        name: true,
        email: true,
        phone: true,
        attendees: true,
        status: true,
        extraData: true,
        source: true,
        utmCampaign: true,
        utmMedium: true,
        gclid: true,
        referrer: true,
        createdAt: true,
      },
    });

    if (format === "csv") {
      const headers = [
        "予約番号", "氏名", "メール", "電話", "人数", "ステータス",
        "流入元", "utmCampaign", "utmMedium", "gclid", "referrer", "追加項目", "予約日時",
      ];
      const rows = reservations.map((r) => [
        r.reservationNo,
        r.name,
        r.email,
        r.phone ?? "",
        r.attendees,
        r.status,
        r.source ?? "",
        r.utmCampaign ?? "",
        r.utmMedium ?? "",
        r.gclid ?? "",
        r.referrer ?? "",
        r.extraData ? JSON.stringify(r.extraData) : "",
        r.createdAt.toISOString(),
      ]);
      const csv =
        "﻿" +
        [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="oc-reservations-${eventId}.csv"`,
        },
      });
    }

    return NextResponse.json(reservations);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

export const PATCH = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "オープンキャンパスを編集する権限がありません" }, { status: 403 });
  }

  try {
    const parsed = StatusPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { id, status } = parsed.data;

    const db = getTenantDb();
    const existing = await db.oCReservation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
    }

    const updated = await db.oCReservation.update({
      where: { id },
      data: {
        status,
        ...(status === "キャンセル" ? { canceledAt: new Date() } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});
