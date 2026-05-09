import { LRUCache } from "lru-cache";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { ENV } from "@/lib/env";

export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getClientIp(request: NextRequest): string {
  const trusted = request.headers.get(ENV.TRUSTED_PROXY_HEADER);
  if (trusted) return trusted.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.ip || "unknown";
}

const limiter = new LRUCache<string, { count: number; resetAt: number }>({
  max: 50_000,
  ttl: 60 * 60 * 1000,
});

export function checkRateLimit(key: string, maxReq = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = limiter.get(key);
  if (!entry || now > entry.resetAt) {
    limiter.set(key, { count: 1, resetAt: now + windowMs }, { ttl: windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= maxReq;
}

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

export function issueCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyCsrf(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const cookie = request.cookies.get(CSRF_COOKIE)?.value;
  const header = request.headers.get(CSRF_HEADER);
  if (!cookie || !header) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const CSRF = { COOKIE: CSRF_COOKIE, HEADER: CSRF_HEADER } as const;
