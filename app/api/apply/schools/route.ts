import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 常に動的レンダリング（キャッシュ無効）
export const dynamic = "force-dynamic";

// GET: 有効な志望校一覧（認証不要・公開）
// Returns active schools ordered by displayOrder
export async function GET() {
  try {
    const schools = await prisma.applySchool.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        schoolKey: true,
        name: true,
        hojin: true,
        icon: true,
        isActive: true,
        displayOrder: true,
        departments: true,
      },
    });

    // Parse departments JSON for each school
    const result = schools.map((s: typeof schools[0]) => {
      let departments: { name: string; duration: string; courses: string[] }[] = [];
      try {
        departments = JSON.parse(s.departments);
      } catch {
        departments = [];
      }
      // id を schoolKey に統一（フォームとformConfigの schoolId と一致させる）
      return { ...s, id: s.schoolKey, departments };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/apply/schools error:", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
