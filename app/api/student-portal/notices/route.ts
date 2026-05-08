import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId") || "school-haba";
  try {
    const notices = await prisma.schoolNotice.findMany({
      where: { schoolId, isPublished: true },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 30,
    });
    return NextResponse.json(notices);
  } catch (e) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
