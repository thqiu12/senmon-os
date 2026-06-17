import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { ApplySchoolUpsertSchema } from "@/lib/schemas";
import { FALLBACK_DEPARTMENTS } from "@/lib/schoolsFallback";
import { logError } from "@/lib/logger";

type DeptInput = { name: string; duration?: string; courses?: string[] };

async function syncDepartments(applySchoolId: string, depts: DeptInput[]) {
  // 既存の active な学科を取得
  const existing = await prisma.applyDepartment.findMany({
    where: { applySchoolId },
  });
  const incomingNames = new Set(depts.map((d) => d.name));

  // 入力にない学科は inactive にする（FK 参照を保つため削除はしない）
  const stale = existing.filter((e) => e.isActive && !incomingNames.has(e.name));
  if (stale.length > 0) {
    await prisma.applyDepartment.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { isActive: false },
    });
  }

  // 入力にある学科は upsert + active 化
  for (let i = 0; i < depts.length; i++) {
    const d = depts[i];
    if (!d.name) continue;
    await prisma.applyDepartment.upsert({
      where: { applySchoolId_name: { applySchoolId, name: d.name } },
      create: {
        applySchoolId,
        name: d.name,
        duration: d.duration || "2年制",
        courses: JSON.stringify(d.courses ?? []),
        displayOrder: i,
        isActive: true,
      },
      update: {
        duration: d.duration || "2年制",
        courses: JSON.stringify(d.courses ?? []),
        displayOrder: i,
        isActive: true,
      },
    });
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const schools = await prisma.applySchool.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        applyDepartments: {
          where: { isActive: true },
          orderBy: { displayOrder: "asc" },
        },
      },
    });
    const result = schools.map((s) => {
      // 学科は ApplyDepartment（正規テーブル）優先。未投入の場合は
      // ApplySchool.departments（JSONスナップショット）にフォールバックして表示する。
      let departments = s.applyDepartments.map((d) => ({
        id: d.id,
        name: d.name,
        duration: d.duration,
        courses: (() => {
          try { return JSON.parse(d.courses); } catch { return []; }
        })(),
      })) as { id?: string; name: string; duration: string; courses: string[] }[];
      if (departments.length === 0 && s.departments) {
        try {
          const snap = JSON.parse(s.departments);
          if (Array.isArray(snap)) {
            departments = snap.map((d) => ({
              name: String(d?.name ?? ""),
              duration: String(d?.duration ?? ""),
              courses: Array.isArray(d?.courses) ? d.courses.map(String) : [],
            }));
          }
        } catch { /* スナップショット不正時は空のまま */ }
      }
      // それでも空なら、出願フォームと同じ正規データを表示（保存でDBに確定）
      if (departments.length === 0 && FALLBACK_DEPARTMENTS[s.schoolKey]) {
        departments = FALLBACK_DEPARTMENTS[s.schoolKey].map((d) => ({
          name: d.name, duration: d.duration, courses: [...d.courses],
        }));
      }
      // 内部 FK は表に出さない
      return { ...s, departments, applyDepartments: undefined };
    });
    return NextResponse.json(result);
  } catch (e) {
    logError("GET /api/admin/schools", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const parsed = ApplySchoolUpsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { departments, ...rest } = parsed.data;
    const school = await prisma.applySchool.create({
      data: { ...rest, departments: JSON.stringify(departments) },
    });
    await syncDepartments(school.id, departments as DeptInput[]);
    return NextResponse.json(school, { status: 201 });
  } catch (e: unknown) {
    logError("POST /api/admin/schools", e);
    const msg = e instanceof Error && e.message.includes("Unique constraint")
      ? "schoolKey が重複しています"
      : "作成に失敗しました";
    const status = msg.includes("重複") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    const parsed = ApplySchoolUpsertSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { departments, ...rest } = parsed.data;
    const updated = await prisma.applySchool.update({
      where: { id },
      data: {
        ...rest,
        ...(departments !== undefined && { departments: JSON.stringify(departments) }),
      },
    });
    if (departments !== undefined) {
      await syncDepartments(id, departments as DeptInput[]);
    }
    return NextResponse.json(updated);
  } catch (e) {
    logError("PUT /api/admin/schools", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const fromQuery = new URL(request.url).searchParams.get("id");
    let fromBody: string | null = null;
    if (!fromQuery) {
      try {
        const body = await request.json();
        if (typeof body?.id === "string") fromBody = body.id;
      } catch {
        /* no body */
      }
    }
    const id = fromQuery || fromBody;
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });

    // ApplySchool に紐づく Application があれば削除を拒否（snapshot 保持のため）
    const cnt = await prisma.application.count({ where: { applySchoolId: id } });
    if (cnt > 0) {
      return NextResponse.json(
        { error: `この学校には ${cnt} 件の申請が紐付いているため削除できません。「無効化」をお試しください。` },
        { status: 409 },
      );
    }
    await prisma.applySchool.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/schools", e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
