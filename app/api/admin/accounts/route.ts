import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import crypto from "crypto";

// GET: アカウント一覧
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, username: true, displayName: true, role: true,
        isActive: true, createdAt: true, lastLoginAt: true,
      },
    });
    return NextResponse.json(users);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: アカウント作成
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const { username, password, displayName, role } = body;
    if (!username || !password || !displayName || !role) {
      return NextResponse.json({ error: "全項目を入力してください" }, { status: 400 });
    }
    if (!["super_admin", "admin", "interviewer"].includes(role)) {
      return NextResponse.json({ error: "無効なロールです" }, { status: 400 });
    }
    const exists = await prisma.adminUser.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ error: "このユーザー名は既に使用されています" }, { status: 409 });
    }
    const user = await prisma.adminUser.create({
      data: { id: crypto.randomUUID(), username, passwordHash: await hashPassword(password), displayName, role, isActive: true, updatedAt: new Date() },
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

// PATCH: アカウント更新（パスワード変更・ロール変更・有効化/無効化）
export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.role !== undefined) {
      if (!isAdminRole(body.role)) {
        return NextResponse.json({ error: "無効なロールです" }, { status: 400 });
      }
      data.role = body.role;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) {
      if (typeof body.password !== "string" || body.password.length < 8) {
        return NextResponse.json({ error: "パスワードは8文字以上にしてください" }, { status: 400 });
      }
      data.passwordHash = await hashPassword(body.password);
    }

    const target = await prisma.adminUser.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
    if (!target) return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    const willRemoveSuperAdmin =
      target.role === "super_admin" &&
      (data.role !== undefined && data.role !== "super_admin" || data.isActive === false);
    if (willRemoveSuperAdmin) {
      const activeSuperAdminCount = await prisma.adminUser.count({
        where: { role: "super_admin", isActive: true },
      });
      if (activeSuperAdminCount <= 1) {
        return NextResponse.json(
          { error: "最後のsuper_adminは降格または無効化できません" },
          { status: 400 }
        );
      }
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

// DELETE: アカウント削除
export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    // 自分自身は削除不可
    if (id === session?.userId) {
      return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });
    }
    const target = await prisma.adminUser.findUnique({
      where: { id },
      select: { role: true, isActive: true },
    });
    if (!target) return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    if (target.role === "super_admin" && target.isActive) {
      const activeSuperAdminCount = await prisma.adminUser.count({
        where: { role: "super_admin", isActive: true },
      });
      if (activeSuperAdminCount <= 1) {
        return NextResponse.json(
          { error: "最後のsuper_adminは削除できません" },
          { status: 400 }
        );
      }
    }
    await prisma.adminUser.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
