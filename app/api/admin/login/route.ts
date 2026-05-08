import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/auth";

function hashPassword(pwd: string): string {
  return crypto.createHash("sha256").update(pwd + "senmon-salt-2024").digest("hex");
}

function makeSessionToken(userId: string, role: string): string {
  const secret = process.env.SESSION_SECRET || "senmon-secret-2024";
  const payload = `${userId}:${role}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

export async function POST(request: NextRequest) {
  // ブルートフォース対策：IP単位で15分に10回まで
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "ログイン試行回数が多すぎます。15分後に再試行してください" }, { status: 429 });
  }
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "ユーザー名とパスワードを入力してください" }, { status: 400 });
    }

    // DBからユーザー取得
    const user = await prisma.adminUser.findUnique({ where: { username } });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "ユーザー名またはパスワードが正しくありません" }, { status: 401 });
    }

    if (user.passwordHash !== hashPassword(password)) {
      return NextResponse.json({ error: "ユーザー名またはパスワードが正しくありません" }, { status: 401 });
    }

    // 最終ログイン日時を更新
    await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = makeSessionToken(user.id, user.role);
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });

    response.cookies.set({
      name: "admin_token",
      value: token,
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    // ロール情報もCookieに（フロント参照用・署名なし）
    response.cookies.set({
      name: "admin_role",
      value: user.role,
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    response.cookies.set({
      name: "admin_display_name",
      value: Buffer.from(user.displayName).toString("base64"),
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("POST /api/admin/login error:", error);
    return NextResponse.json({ error: "ログインに失敗しました" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  ["admin_token", "admin_role", "admin_display_name"].forEach(name => {
    response.cookies.set({ name, value: "", httpOnly: false, secure: false, sameSite: "lax", maxAge: 0, path: "/" });
  });
  return response;
}
