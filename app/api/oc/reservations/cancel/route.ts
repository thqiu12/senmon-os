import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";

export const dynamic = "force-dynamic";

// 公開API: 予約キャンセル。reservationNo + email（大小無視一致）で本人確認。
// キャンセル済みなら冪等にOKを返す。キャンセルで席は自動的に空く
// （ACTIVE 集計から「キャンセル」は除外されるため）。
export const POST = withTenant(async (request: NextRequest) => {
  try {
    const raw = (await request.json().catch(() => ({}))) as {
      reservationNo?: unknown;
      email?: unknown;
    };
    const reservationNo = typeof raw.reservationNo === "string" ? raw.reservationNo : "";
    const email = typeof raw.email === "string" ? raw.email : "";
    if (!reservationNo || !email) {
      return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
    }

    const db = getTenantDb();
    const reservation = await db.oCReservation.findUnique({ where: { reservationNo } });
    if (!reservation || reservation.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
    }

    if (reservation.status === "キャンセル") {
      return NextResponse.json({ ok: true });
    }

    await db.oCReservation.update({
      where: { reservationNo },
      data: { status: "キャンセル", canceledAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/oc/reservations/cancel error:", error);
    return NextResponse.json({ error: "キャンセルに失敗しました" }, { status: 500 });
  }
});
