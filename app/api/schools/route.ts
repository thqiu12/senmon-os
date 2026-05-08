import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const schools = await prisma.school.findMany({
      orderBy: { name: "asc" },
      include: {
        courses: { where: { isActive: true }, orderBy: { name: "asc" } },
        _count: { select: { students: true, teachers: true } },
      },
    });
    return NextResponse.json(schools);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
