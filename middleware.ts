import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_API_PREFIX = "/api/admin/";
const ADMIN_PAGE_PREFIX = "/admin";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const ADMIN_API_PUBLIC = new Set<string>([
  "/api/admin/login",
]);

const STATE_CHANGING_API_PREFIXES = [
  "/api/admin/",
  "/api/applications",
  "/api/students",
  "/api/agents",
  "/api/announcements",
  "/api/attendance",
  "/api/cohorts",
  "/api/certificate-requests",
  "/api/enrollment",
  "/api/homework",
  "/api/interviewers",
  "/api/interview-feedback",
  "/api/leave-requests",
  "/api/notifications",
  "/api/schools",
  "/api/student-portal",
  "/api/timetable",
  "/api/upload",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  if (pathname.startsWith(ADMIN_API_PREFIX) && !ADMIN_API_PUBLIC.has(pathname)) {
    if (!req.cookies.get("admin_token")) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
  }

  // CSRF は管理者セッション保有時のみ強制（公開フォーム送信は対象外）
  const hasAdminToken = !!req.cookies.get("admin_token");
  if (
    hasAdminToken &&
    !SAFE_METHODS.has(method) &&
    STATE_CHANGING_API_PREFIXES.some((p) => pathname.startsWith(p)) &&
    !ADMIN_API_PUBLIC.has(pathname)
  ) {
    const cookie = req.cookies.get("csrf_token")?.value;
    const header = req.headers.get("x-csrf-token");
    if (!cookie || !header || cookie !== header) {
      return NextResponse.json({ error: "CSRFトークンが無効です" }, { status: 403 });
    }
  }

  if (pathname.startsWith(ADMIN_PAGE_PREFIX) && pathname !== "/admin") {
    if (!req.cookies.get("admin_token")) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/admin/:path*",
  ],
};
