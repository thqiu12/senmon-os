import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";

export const GET = withTenant(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const student = await getTenantDb().student.findFirst({
      where: { id: params.id },
      include: {
        school: { select: { id: true, name: true } },
        class: {
          select: { id: true, name: true, year: true, month: true,
            course: { select: { id: true, name: true } } },
        },
        _count: { select: { attendances: true, homeworkSubmissions: true, leaveRequests: true } },
      },
    });
    if (!student) return NextResponse.json({ error: "学生が見つかりません" }, { status: 404 });
    return NextResponse.json(student);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

export const PATCH = withTenant(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};
    ["classId", "status", "phone", "email", "enrolledAt", "graduatedAt", "studentNo"].forEach(f => {
      if (body[f] !== undefined) data[f] = body[f];
    });
    const student = await getTenantDb().student.update({ where: { id: params.id }, data });
    return NextResponse.json(student);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});
