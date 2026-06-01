import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

// GET: 出席記録取得
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const classId = searchParams.get("classId");
    const subjectId = searchParams.get("subjectId");
    const date = searchParams.get("date");
    const month = searchParams.get("month"); // YYYY-MM
    const timetableSlotId = searchParams.get("timetableSlotId");

    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (subjectId) where.subjectId = subjectId;
    if (timetableSlotId) where.timetableSlotId = timetableSlotId;
    if (date) where.date = date;
    if (month) where.date = { startsWith: month };
    if (classId) {
      where.student = { classId };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        student: { select: { id: true, studentNo: true, lastName: true, firstName: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(records);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: 出席記録（一括 or 単件）
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const body = await request.json();
    // records: [{studentId, subjectId, timetableSlotId?, teacherId?, date, status, note?}]
    const { records } = body;
    if (!records?.length) return NextResponse.json({ error: "recordsが必要です" }, { status: 400 });

    const created = [];
    for (const r of records) {
      const record = await prisma.attendance.upsert({
        where: {
          studentId_timetableSlotId_date: {
            studentId: r.studentId,
            timetableSlotId: r.timetableSlotId || "",
            date: r.date,
          },
        },
        create: {
          id: crypto.randomUUID(),
          studentId: r.studentId,
          subjectId: r.subjectId,
          timetableSlotId: r.timetableSlotId || null,
          teacherId: r.teacherId || null,
          date: r.date,
          status: r.status,
          note: r.note || null,
        },
        update: {
          status: r.status,
          note: r.note || null,
          teacherId: r.teacherId || null,
        },
      });
      created.push(record);
    }
    return NextResponse.json({ success: true, count: created.length, records: created });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "出席記録の保存に失敗しました" }, { status: 500 });
  }
}
