import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/logger";

const PASS_STATUSES = ["合格", "補欠合格"];
const REVIEWED_STATUSES = ["合格", "補欠合格", "不合格", "保留"];

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get("cohortId");

    if (cohortId) {
      const cohortFilter = cohortId === "none" ? { cohortId: null, deletedAt: null } : { cohortId, deletedAt: null };

      const [statusGroups, total, withDocs] = await Promise.all([
        prisma.application.groupBy({
          by: ["status"],
          where: cohortFilter,
          _count: { _all: true },
        }),
        prisma.application.count({ where: cohortFilter }),
        prisma.application.count({
          where: { ...cohortFilter, documents: { some: {} } },
        }),
      ]);

      const statusCounts: Record<string, number> = {};
      let passedCount = 0;
      let reviewedCount = 0;
      for (const g of statusGroups) {
        statusCounts[g.status] = g._count._all;
        if (PASS_STATUSES.includes(g.status)) passedCount += g._count._all;
        if (REVIEWED_STATUSES.includes(g.status)) reviewedCount += g._count._all;
      }

      return NextResponse.json({
        cohortSummary: {
          total,
          passedCount,
          reviewedCount,
          passRate: reviewedCount > 0 ? passedCount / reviewedCount : null,
          withDocs,
          docRate: total > 0 ? withDocs / total : null,
          statusCounts,
        },
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [statusGroups, todayCount, passedApps] = await Promise.all([
      prisma.application.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.application.count({ where: { createdAt: { gte: todayStart }, deletedAt: null } }),
      prisma.application.findMany({
        where: { status: { in: PASS_STATUSES }, deletedAt: null },
        select: {
          enrollmentProcedure: {
            select: { status: true, schoolConfirmed: true, admitLetterIssued: true },
          },
        },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    let total = 0;
    for (const g of statusGroups) {
      statusCounts[g.status] = g._count._all;
      total += g._count._all;
    }

    const enrollmentStats = {
      announced: 0,
      step1Waiting: 0,
      step2Waiting: 0,
      schoolConfirmWaiting: 0,
      admitLetterIssued: 0,
    };
    for (const app of passedApps) {
      const ep = app.enrollmentProcedure;
      if (!ep) continue;
      if (ep.admitLetterIssued) {
        enrollmentStats.admitLetterIssued++;
        continue;
      }
      const isCompletedStage = ep.status === "STEP2完了" || ep.status === "STEP3完了" || ep.status === "完了";
      if (!ep.schoolConfirmed && isCompletedStage) {
        enrollmentStats.schoolConfirmWaiting++;
      } else if (ep.status === "STEP1完了") {
        enrollmentStats.step2Waiting++;
      } else if (ep.status === "案内済み") {
        enrollmentStats.step1Waiting++;
      } else {
        enrollmentStats.announced++;
      }
    }

    return NextResponse.json({ total, statusCounts, todayCount, enrollmentStats });
  } catch (error) {
    logError("GET /api/applications/stats", error);
    return NextResponse.json({ error: "統計の取得に失敗しました" }, { status: 500 });
  }
}
