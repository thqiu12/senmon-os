import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { hashPassword, PWD_VERSION_BCRYPT } from "@/lib/password";
import { AdminAccountCreateSchema, AdminAccountUpdateSchema } from "@/lib/schemas";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    return NextResponse.json(users);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const parsed = AdminAccountCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { username, password, displayName, role } = parsed.data;
    const exists = await prisma.adminUser.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json(
        { error: "このユーザー名は既に使用されています" },
        { status: 409 },
      );
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.adminUser.create({
      data: {
        id: crypto.randomUUID(),
        username,
        passwordHash,
        passwordVersion: PWD_VERSION_BCRYPT,
        displayName,
        role,
        isActive: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

    const parsed = AdminAccountUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.password) {
      data.passwordHash = await hashPassword(parsed.data.password);
      data.passwordVersion = PWD_VERSION_BCRYPT;
    }
    const user = await prisma.adminUser.update({
      where: { id },
      data,
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });
    return NextResponse.json(user);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    if (id === session?.userId) {
      return NextResponse.json(
        { error: "自分自身のアカウントは削除できません" },
        { status: 400 },
      );
    }
    await prisma.adminUser.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
