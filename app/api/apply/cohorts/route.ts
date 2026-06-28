import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// 現在受付中の選考バッチを返す
// ?schoolKey=xxx を渡すと: 当該校 + 全校共通(schoolKey=null) のみ返す
export const GET = withTenant(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const schoolKey = searchParams.get("schoolKey");
    const now = new Date();

    const where: Prisma.CohortWhereInput = { status: "受付中" };
    if (schoolKey) {
      where.OR = [{ schoolKey }, { schoolKey: null }];
    }

    const cohorts = await getTenantDb().cohort.findMany({
      where,
      select: {
        id: true,
        name: true,
        year: true,
        round: true,
        schoolKey: true,
        acceptStart: true,
        acceptEnd: true,
        examDate: true,
        deadline: true,
      },
      orderBy: [{ schoolKey: "asc" }, { round: "asc" }],
    });

    const includeUpcoming = searchParams.get("includeUpcoming") === "1";

    const active = cohorts.filter((c) => {
      if (c.acceptStart && new Date(c.acceptStart) > now) return false;
      if (c.acceptEnd && new Date(c.acceptEnd) < now) return false;
      return true;
    });

    // 既定（パラメータ無し）は従来どおり「受付中のみ」を返す。
    // ← apply フォーム側はこれで受付可否を判定しているため、挙動を変えない。
    if (!includeUpcoming) {
      return NextResponse.json(active);
    }

    // includeUpcoming=1: トップページ用に「次回」（status=受付中 だが acceptStart がまだ未来）も
    // 付帯して返す。受付中=upcoming:false / 次回=upcoming:true で区別する。
    const upcoming = cohorts.filter(
      (c) => c.acceptStart && new Date(c.acceptStart) > now,
    );
    return NextResponse.json([
      ...active.map((c) => ({ ...c, upcoming: false })),
      ...upcoming.map((c) => ({ ...c, upcoming: true })),
    ]);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
});
