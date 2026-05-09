import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/security";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`notices:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }
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
    console.error("GET /api/student-portal/notices error:", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
