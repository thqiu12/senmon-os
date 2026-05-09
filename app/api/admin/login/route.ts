import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENV } from "@/lib/env";
import { makeSessionToken } from "@/lib/auth";
import { checkRateLimit, getClientIp, issueCsrfToken, CSRF } from "@/lib/security";
import { hashPassword, verifyPassword, PWD_VERSION_BCRYPT } from "@/lib/password";
import { AdminLoginSchema } from "@/lib/schemas";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: ENV.isProd,
  sameSite: "strict" as const,
  maxAge: 60 * 60 * 8,
  path: "/",
};

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "ログイン試行回数が多すぎます。15分後に再試行してください" },
      { status: 429 },
    );
  }

  try {
    const parsed = AdminLoginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ユーザー名とパスワードを入力してください" },
        { status: 400 },
      );
    }
    const { username, password } = parsed.data;

    const user = await prisma.adminUser.findUnique({ where: { username } });
    const fakeHash = "$2b$12$............................................................";
    const stored = user?.passwordHash || fakeHash;
    const version = user?.passwordVersion ?? 1;

    const ok = await verifyPassword(password, stored, version);
    if (!user || !user.isActive || !ok) {
      return NextResponse.json(
        { error: "ユーザー名またはパスワードが正しくありません" },
        { status: 401 },
      );
    }

    if (version !== PWD_VERSION_BCRYPT) {
      const newHash = await hashPassword(password);
      await prisma.adminUser.update({
        where: { id: user.id },
        data: { passwordHash: newHash, passwordVersion: PWD_VERSION_BCRYPT, lastLoginAt: new Date() },
      });
    } else {
      await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    }

    const token = makeSessionToken(user.id, user.role);
    const csrf = issueCsrfToken();

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      csrfToken: csrf,
    });

    response.cookies.set({ name: "admin_token", value: token, ...COOKIE_OPTS });
    const uiCookie = {
      httpOnly: false,
      secure: ENV.isProd,
      sameSite: "strict" as const,
      maxAge: COOKIE_OPTS.maxAge,
      path: "/",
    };
    response.cookies.set({ name: CSRF.COOKIE, value: csrf, ...uiCookie });
    response.cookies.set({ name: "admin_role", value: user.role, ...uiCookie });
    response.cookies.set({
      name: "admin_display_name",
      value: Buffer.from(user.displayName).toString("base64"),
      ...uiCookie,
    });
    return response;
  } catch (error) {
    console.error("POST /api/admin/login error:", error);
    return NextResponse.json({ error: "ログインに失敗しました" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  for (const name of ["admin_token", CSRF.COOKIE, "admin_role", "admin_display_name"]) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: name === "admin_token",
      secure: ENV.isProd,
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });
  }
  return response;
}
