import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { requireOrgId } from "@/lib/tenant/context";
import { TimetableCreateSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const schoolId = searchParams.get("schoolId");
    const where: Prisma.TimetableWhereInput = { isActive: true };
    if (classId) where.classId = classId;
    if (schoolId) where.schoolId = schoolId;

    const timetables = await getTenantDb().timetable.findMany({
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
    logError("GET /api/timetable", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const parsed = TimetableCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { schoolId, classId, name, validFrom, validTo, slots } = parsed.data;
    // ネスト create(slots)は拡張が org を注入しないため明示的に付与する。
    const orgId = requireOrgId();
    const timetable = await getTenantDb().timetable.create({
      data: {
        schoolId,
        classId,
        name: name ?? null,
        validFrom,
        validTo: validTo ?? null,
        isActive: true,
        slots: slots && slots.length > 0
          ? {
              create: slots.map((s) => ({
                organizationId: orgId,
                subjectId: s.subjectId,
                teacherId: s.teacherId ?? null,
                dayOfWeek: s.dayOfWeek,
                period: s.period,
                startTime: s.startTime,
                endTime: s.endTime,
                room: s.room ?? null,
              })),
            }
          : undefined,
      },
      include: { slots: { include: { subject: true, teacher: true } } },
    });
    return NextResponse.json(timetable, { status: 201 });
  } catch (e) {
    logError("POST /api/timetable", e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
});
