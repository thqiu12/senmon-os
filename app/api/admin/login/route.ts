import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeSessionToken } from "@/lib/auth";
import { checkRateLimit, getClientIp, issueCsrfToken, CSRF } from "@/lib/security";
import { hashPassword, verifyPassword, PWD_VERSION_BCRYPT } from "@/lib/password";
import { AdminLoginSchema } from "@/lib/schemas";

/**
 * cookie の secure フラグを動的に決定する。
 *  - HTTPS 接続 (nginx の X-Forwarded-Proto=https または直接 https) → secure=true
 *  - HTTP のみのデプロイ（ドメイン未取得・テスト中など） → secure=false にしないと
 *    ブラウザが cookie を保存できず、ログイン後に admin_token が消えて /admin で
 *    無限リダイレクトループになる。
 *
 * 本番でも HTTP 経由ならログイン自体が成立しないので、secure を一律 ENV.isProd に
 * 縛らず、実際のリクエストプロトコルで判定する。
 */
function isHttpsRequest(request: NextRequest): boolean {
  // nginx などのプロキシ経由
  const xfp = request.headers.get("x-forwarded-proto");
  if (xfp) return xfp.split(",")[0].trim().toLowerCase() === "https";
  // プロキシ無し / 直接アクセス
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function cookieOpts(request: NextRequest) {
  return {
    httpOnly: true,
    secure: isHttpsRequest(request),
    sameSite: "strict" as const,
    maxAge: 60 * 60 * 8,
    path: "/",
  };
}

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

    const token = makeSessionToken(user.id, user.role, user.tokenVersion);
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

    const opts = cookieOpts(request);
    response.cookies.set({ name: "admin_token", value: token, ...opts });
    response.cookies.set({
      name: CSRF.COOKIE,
      value: csrf,
      httpOnly: false,
      secure: opts.secure,
      sameSite: "strict",
      maxAge: opts.maxAge,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("POST /api/admin/login error:", error);
    return NextResponse.json({ error: "ログインに失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  const secure = isHttpsRequest(request);
  for (const name of ["admin_token", CSRF.COOKIE, "admin_role", "admin_display_name"]) {
    // admin_role / admin_display_name は旧クライアント互換のためクリアのみ実行
    response.cookies.set({
      name,
      value: "",
      httpOnly: name === "admin_token",
      secure,
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });
  }
  return response;
}
