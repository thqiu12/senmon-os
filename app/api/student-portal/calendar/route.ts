import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { checkRateLimit, getClientIp } from "@/lib/security";

export const GET = withTenant(async (request: NextRequest) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`calendar:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId") || "school-haba";
  const month = searchParams.get("month"); // YYYY-MM

  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "monthは YYYY-MM 形式で指定してください" }, { status: 400 });
  }

  try {
    const where: Record<string, unknown> = { schoolId, isPublished: true };
    if (month) {
      where.eventDate = { gte: `${month}-01`, lte: `${month}-31` };
    }
    const events = await getTenantDb().calendarEvent.findMany({
      where,
      orderBy: { eventDate: "asc" },
    });
    return NextResponse.json(events);
  } catch (e) {
    console.error("GET /api/student-portal/calendar error:", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});
