import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";

// GET: 学生一覧
export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const classId = searchParams.get("classId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { lastName: { contains: search } },
        { firstName: { contains: search } },
        { studentNo: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const students = await getTenantDb().student.findMany({
      where,
      orderBy: { studentNo: "asc" },
      include: {
        school: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        _count: { select: { attendances: true, homeworkSubmissions: true } },
      },
    });
    return NextResponse.json(students);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

// PATCH: 学生情報更新
export const PATCH = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const body = await request.json();
    const data: Record<string, unknown> = {};
    const fields = ["classId", "status", "phone", "email", "enrolledAt", "graduatedAt", "studentNo"];
    fields.forEach(f => { if (body[f] !== undefined) data[f] = body[f]; });
    const student = await getTenantDb().student.update({ where: { id }, data });
    return NextResponse.json(student);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});
