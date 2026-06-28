import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { logError } from "@/lib/logger";

// 削除済み（ゴミ箱）の出願一覧。削除者・日時・理由＝操作ログを表示し、復元の起点にする。
export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const rows = await getTenantDb().application.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        applicationNo: true,
        lastName: true,
        firstName: true,
        schoolName: true,
        department: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        deletedBy: true,
        deleteReason: true,
      },
    });
    return NextResponse.json(rows);
  } catch (e) {
    logError("GET /api/admin/deleted-applications", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});
