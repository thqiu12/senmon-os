import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get("cohortId");

    // cohortId指定時はCohortサマリーを返す
    if (cohortId) {
      const cohortWhere = cohortId === "none"
        ? { cohortId: null }
        : { cohortId };

      const allApps = await prisma.application.findMany({
        where: cohortWhere,
        include: {
          documents: { select: { id: true } },
        },
      });

      const total = allApps.length;
      const passedCount = allApps.filter(a => a.status === "合格" || a.status === "補欠合格").length;
      const reviewedCount = allApps.filter(a => ["合格", "補欠合格", "不合格", "保留"].includes(a.status)).length;
      const passRate = reviewedCount > 0 ? passedCount / reviewedCount : null;
      const withDocs = allApps.filter(a => a.documents.length > 0).length;
      const docRate = total > 0 ? withDocs / total : null;

      // ステータス別カウント
      const statusCounts: Record<string, number> = {};
      for (const app of allApps) {
        statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
      }

      return NextResponse.json({
        cohortSummary: {
          total,
          passedCount,
          reviewedCount,
          passRate,
          withDocs,
          docRate,
          statusCounts,
        },
      });
    }

    // 全申請のステータス別カウント（全量）
    const statusGroups = await prisma.application.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {};
    let total = 0;
    for (const g of statusGroups) {
      statusCounts[g.status] = g._count.id;
      total += g._count.id;
    }

    // 今日の申請数
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await prisma.application.count({
      where: { createdAt: { gte: todayStart } },
    });

    // 入学手続き進捗（全量・合格/補欠合格のみ）
    const passedApps = await prisma.application.findMany({
      where: { status: { in: ["合格", "補欠合格"] } },
      include: {
        enrollmentProcedure: {
          select: { status: true, schoolConfirmed: true, admitLetterIssued: true },
        },
      },
    });

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
      if (ep.admitLetterIssued) { enrollmentStats.admitLetterIssued++; continue; }
      if (ep.schoolConfirmed === false && (ep.status === "STEP2完了" || ep.status === "STEP3完了" || ep.status === "完了")) {
        enrollmentStats.schoolConfirmWaiting++;
      } else if (ep.status === "STEP1完了") {
        enrollmentStats.step2Waiting++;
      } else if (ep.status === "案内済み") {
        enrollmentStats.step1Waiting++;
      } else {
        enrollmentStats.announced++;
      }
    }

    return NextResponse.json({
      total,
      statusCounts,
      todayCount,
      enrollmentStats,
    });
  } catch (error) {
    console.error("GET /api/applications/stats error:", error);
    return NextResponse.json({ error: "統計の取得に失敗しました" }, { status: 500 });
  }
}
