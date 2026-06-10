import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { buildRecipientWhere } from "@/lib/announcement-targeting";

/**
 * お知らせ送信フィルターの補助 API（管理者専用）。
 *   ?facets=1 → フォーム用の学校一覧 { schools: string[] }
 *   それ以外  → 現フィルタの送信対象件数 { count }（実送信と同じロジック）
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("facets") === "1") {
      // 出願に出現する学校名（主志望 + 併願）を distinct で集約
      const [primary, sub] = await Promise.all([
        prisma.application.findMany({ select: { schoolName: true }, distinct: ["schoolName"] }),
        prisma.applicationSchool.findMany({ select: { schoolName: true }, distinct: ["schoolName"] }),
      ]);
      const schools = Array.from(
        new Set([...primary, ...sub].map((r) => r.schoolName).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "ja"));
      return NextResponse.json({ schools });
    }

    const where = buildRecipientWhere({
      targetType: searchParams.get("targetType"),
      targetCohortId: searchParams.get("cohortId"),
      targetSchool: searchParams.get("school"),
      targetStatus: searchParams.get("status"),
    });

    // 宛先はメール単位で重複排除（実送信と同じ distinct email）
    const recipients = await prisma.application.findMany({
      where,
      select: { email: true },
      distinct: ["email"],
    });
    const count = recipients.filter((r) => !!r.email).length;
    return NextResponse.json({ count });
  } catch (e) {
    logError("GET /api/announcements/recipients", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
