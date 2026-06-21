import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isCoreAdmin } from "@/lib/auth";
import { logError } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 50; // 1ページ最大50件

// 操作ログ（監査ログ）の一覧。全職員の操作が見えるため最高管理者・管理者のみ。
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isCoreAdmin(session)) {
    return NextResponse.json({ error: "操作ログを閲覧する権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const action = searchParams.get("action");
    const targetType = searchParams.get("targetType");
    const search = searchParams.get("search");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.AuditLogWhereInput = {};
    if (action && action !== "all") where.action = action;
    if (targetType && targetType !== "all") where.targetType = targetType;
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = new Date(from);
      // to は日付指定（その日いっぱい）を許容するため終端を +1日 にはせず、そのまま <= で扱う
      if (to) range.lte = new Date(to);
      where.createdAt = range;
    }
    if (search) {
      where.OR = [
        { summary: { contains: search } },
        { targetLabel: { contains: search } },
        { actorName: { contains: search } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    logError("GET /api/admin/audit-logs", error);
    return NextResponse.json({ error: "操作ログの取得に失敗しました" }, { status: 500 });
  }
}
