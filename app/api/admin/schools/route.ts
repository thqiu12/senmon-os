import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

// GET: 全志望校一覧（管理者）
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const schools = await prisma.applySchool.findMany({
      orderBy: { displayOrder: "asc" },
    });
    const result = schools.map(s => {
      let departments: unknown[] = [];
      try { departments = JSON.parse(s.departments); } catch { departments = []; }
      return { ...s, departments };
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: 志望校を作成
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { schoolKey, name, hojin, icon, isActive, displayOrder, departments } = body;
    if (!schoolKey || !name || !hojin) {
      return NextResponse.json({ error: "schoolKey, name, hojin は必須です" }, { status: 400 });
    }
    // Validate departments JSON
    let departmentsStr: string;
    if (typeof departments === "string") {
      try { JSON.parse(departments); departmentsStr = departments; } catch {
        return NextResponse.json({ error: "departments は有効なJSON形式で入力してください" }, { status: 400 });
      }
    } else {
      departmentsStr = JSON.stringify(departments ?? []);
    }
    const school = await prisma.applySchool.create({
      data: {
        id: crypto.randomUUID(),
        schoolKey,
        name,
        hojin,
        icon: icon || "🏫",
        isActive: isActive ?? true,
        displayOrder: displayOrder ?? 0,
        departments: departmentsStr,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json(school, { status: 201 });
  } catch (e: unknown) {
    console.error(e);
    const msg = e instanceof Error && e.message.includes("Unique constraint") ? "schoolKey が重複しています" : "作成に失敗しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT: 志望校を更新
export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { id, schoolKey, name, hojin, icon, isActive, displayOrder, departments } = body;
    if (!id) {
      return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    }
    let departmentsStr: string | undefined;
    if (departments !== undefined) {
      if (typeof departments === "string") {
        try { JSON.parse(departments); departmentsStr = departments; } catch {
          return NextResponse.json({ error: "departments は有効なJSON形式で入力してください" }, { status: 400 });
        }
      } else {
        departmentsStr = JSON.stringify(departments);
      }
    }
    const updated = await prisma.applySchool.update({
      where: { id },
      data: {
        ...(schoolKey !== undefined && { schoolKey }),
        ...(name !== undefined && { name }),
        ...(hojin !== undefined && { hojin }),
        ...(icon !== undefined && { icon }),
        ...(isActive !== undefined && { isActive }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(departmentsStr !== undefined && { departments: departmentsStr }),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

// DELETE: 志望校を削除
export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    }
    await prisma.applySchool.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
