import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { remainingSeats } from "@/lib/ocCapacity";

export const dynamic = "force-dynamic";

// 公開API: 公開中かつ未来の OC イベント一覧（残席つき）。
// 予約者の個人情報は一切返さず、計算済みの remaining のみ公開する。
export const GET = withTenant(async (request: NextRequest) => {
  try {
    const school = new URL(request.url).searchParams.get("school") || null;
    const events = await getTenantDb().oCEvent.findMany({
      where: {
        status: "公開",
        startAt: { gt: new Date() },
        ...(school ? { schoolKey: school } : {}),
      },
      orderBy: { startAt: "asc" },
      include: {
        reservations: { select: { attendees: true, status: true } },
      },
    });

    return NextResponse.json(
      events.map((e) => ({
        id: e.id,
        schoolKey: e.schoolKey,
        title: e.title,
        description: e.description,
        startAt: e.startAt,
        endAt: e.endAt,
        location: e.location,
        isOnline: e.isOnline,
        onlineUrl: e.onlineUrl,
        capacity: e.capacity,
        remaining: remainingSeats(e.capacity, e.reservations),
      })),
    );
  } catch (error) {
    console.error("GET /api/oc/events error:", error);
    return NextResponse.json({ error: "イベント一覧の取得に失敗しました" }, { status: 500 });
  }
});
