import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";

export const dynamic = "force-dynamic";

// 公開API: 予約照会。reservationNo + email（大小無視一致）で本人確認。
// 予約とイベントの公開情報のみ返す（他者の個人情報は返さない）。
export const GET = withTenant(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const reservationNo = searchParams.get("reservationNo") || "";
    const email = searchParams.get("email") || "";
    if (!reservationNo || !email) {
      return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
    }

    const reservation = await getTenantDb().oCReservation.findUnique({
      where: { reservationNo },
      include: { ocEvent: true },
    });

    if (!reservation || reservation.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
    }

    const e = reservation.ocEvent;
    return NextResponse.json({
      reservation: {
        reservationNo: reservation.reservationNo,
        name: reservation.name,
        email: reservation.email,
        phone: reservation.phone,
        attendees: reservation.attendees,
        status: reservation.status,
        extraData: reservation.extraData,
        canceledAt: reservation.canceledAt,
        createdAt: reservation.createdAt,
      },
      event: {
        id: e.id,
        schoolKey: e.schoolKey,
        title: e.title,
        description: e.description,
        startAt: e.startAt,
        endAt: e.endAt,
        location: e.location,
        isOnline: e.isOnline,
        onlineUrl: e.onlineUrl,
      },
    });
  } catch (error) {
    console.error("GET /api/oc/status error:", error);
    return NextResponse.json({ error: "予約照会に失敗しました" }, { status: 500 });
  }
});
