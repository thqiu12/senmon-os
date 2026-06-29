import { NextRequest, NextResponse } from "next/server";
import { getSession, canReviewInterviews } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { logError } from "@/lib/logger";

// 常に動的レンダリング（キャッシュ無効）
export const dynamic = "force-dynamic";

// GET: 面接レビュー画面用の候補者一覧（面接官・バックオフィス職員が参照可）。
// 面接官に必要な最小限のフィールドのみ返す（合否・手続き・学費などの管理情報は含めない）。
export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!canReviewInterviews(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const candidates = await getTenantDb().application.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        applicationNo: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        nationality: true,
        birthDate: true,
        japaneseLevel: true,
        schoolName: true,
        department: true,
        applicationReason: true,
        lastSchoolName: true,
        interviewDate: true,
        interviewTime: true,
        interviewPlace: true,
        status: true,
        createdAt: true,
        applicationSchools: {
          select: { priority: true, schoolName: true, department: true },
          orderBy: { priority: "asc" },
        },
        interviewFeedbacks: {
          select: { recommendation: true, scoreOverall: true },
        },
      },
    });
    return NextResponse.json(candidates);
  } catch (e) {
    logError("GET /api/admin/interview-candidates", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});
