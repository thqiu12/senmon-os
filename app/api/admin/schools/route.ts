import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { ApplySchoolUpsertSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const schools = await prisma.applySchool.findMany({
      orderBy: { displayOrder: "asc" },
    });
    const result = schools.map((s) => {
      let departments: unknown[] = [];
      try {
        departments = JSON.parse(s.departments);
      } catch {
        departments = [];
      }
      return { ...s, departments };
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
    // フロントエンドは body の {id} で送ってくるが、後方互換のため
    // ?id= クエリ文字列も許容する。
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
    await prisma.applySchool.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/schools", e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
