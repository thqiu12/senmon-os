import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";
import { computeOCAnalytics } from "@/lib/ocAnalytics";

// オープンキャンパス（OC）分析API。
// 認可: 管理者（isAdmin）+ form.edit ケイパビリティ。
// クエリ: ?school=&from=&to=

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
    const school = searchParams.get("school");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const db = getTenantDb();

    const events = await db.oCEvent.findMany({
      where: {
        ...(school ? { schoolKey: school } : {}),
        ...(from || to
          ? {
              startAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      select: { id: true, title: true, startAt: true, capacity: true, schoolKey: true },
    });

    const reservations = events.length
      ? await db.oCReservation.findMany({
          where: { ocEventId: { in: events.map((e) => e.id) } },
          select: {
            ocEventId: true,
            status: true,
            email: true,
            attendees: true,
            source: true,
            utmCampaign: true,
            createdAt: true,
          },
        })
      : [];

    const apps = await db.application.findMany({
      where: { deletedAt: null },
      select: { email: true, createdAt: true },
    });

    return NextResponse.json(computeOCAnalytics(reservations, apps, events));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});
