import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId") || "school-haba";
  const month = searchParams.get("month"); // YYYY-MM
  try {
    const where: Record<string, unknown> = { schoolId, isPublished: true };
    if (month) {
      where.eventDate = { gte: `${month}-01`, lte: `${month}-31` };
    }
    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: { eventDate: "asc" },
    });
    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
