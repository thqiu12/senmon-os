import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

const DAY_LABELS = ["", "月", "火", "水", "木", "金", "土"];

// GET: 時間割取得
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const schoolId = searchParams.get("schoolId");
    const where: Record<string, unknown> = { isActive: true };
    if (classId) where.classId = classId;
    if (schoolId) where.schoolId = schoolId;

    const timetables = await prisma.timetable.findMany({
      where,
      include: {
        class: { select: { id: true, name: true } },
        slots: {
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(timetables);
  } catch (e) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: 時間割作成
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.schoolId || !body.classId || !body.validFrom) {
      return NextResponse.json({ error: "schoolId・classId・validFromは必須です" }, { status: 400 });
    }
    const timetable = await prisma.timetable.create({
      data: {
        schoolId: body.schoolId,
        classId: body.classId,
        name: body.name || null,
        validFrom: body.validFrom,
        validTo: body.validTo || null,
        isActive: true,
        slots: body.slots ? {
          create: body.slots.map((s: { subjectId: string; teacherId?: string; dayOfWeek: number; period: number; startTime: string; endTime: string; room?: string }) => ({
            subjectId: s.subjectId,
            teacherId: s.teacherId || null,
            dayOfWeek: s.dayOfWeek,
            period: s.period,
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.room || null,
          })),
        } : undefined,
      },
      include: { slots: { include: { subject: true, teacher: true } } },
    });
    return NextResponse.json(timetable, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}
