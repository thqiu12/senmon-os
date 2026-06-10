import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENV } from "@/lib/env";
import crypto from "crypto";

export type AdminRole = "super_admin" | "admin" | "sales" | "interviewer";

export interface AdminSession {
  userId: string;
  role: AdminRole;
  isValid: boolean;
}

// セッショントークンの有効期間（サーバー側で強制）。Cookie の maxAge と揃える。
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 時間

export function makeSessionToken(userId: string, role: string, tokenVersion: number): string {
  const payload = `${userId}:${role}:${tokenVersion}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", ENV.SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

function verifyToken(
  token: string,
): { userId: string; role: string; tokenVersion: number } | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    // payload = userId:role:tokenVersion:issuedAt + sig => 5 parts
    if (parts.length < 5) return null;
    const sig = parts[parts.length - 1];
    const payload = parts.slice(0, parts.length - 1).join(":");
    const expected = crypto.createHmac("sha256", ENV.SESSION_SECRET).update(payload).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    const [userId, role, tv, issuedAtRaw] = parts;
    const tokenVersion = Number(tv);
    if (!Number.isFinite(tokenVersion)) return null;
    // サーバー側でトークンの発行時刻を検証し、期限切れを拒否する。
    // （Cookie の maxAge はクライアント任せのため、流出トークンが無期限に使われるのを防ぐ）
    const issuedAt = Number(issuedAtRaw);
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > SESSION_MAX_AGE_MS) {
      return null;
    }
    return { userId, role, tokenVersion };
  } catch {
    return null;
  }
}

export async function getSession(request: NextRequest): Promise<AdminSession | null> {
  const token = request.cookies.get("admin_token")?.value;
  if (!token) return null;
  const parsed = verifyToken(token);
  if (!parsed) return null;
  try {
    const user = await prisma.adminUser.findUnique({ where: { id: parsed.userId } });
    if (!user || !user.isActive) return null;
    if (user.tokenVersion !== parsed.tokenVersion) return null;
    return { userId: user.id, role: user.role as AdminRole, isValid: true };
  } catch {
    return null;
  }
}

// 一般的な管理権限。営業(sales)もここに含む＝ほぼ全機能を利用可。
// ただし「出願フォーム編集・選考操作」は isCoreAdmin、「アカウント管理」は
// isSuperAdmin で別途制限する（営業はこれら3領域だけ不可）。
export function isAdmin(session: AdminSession | null): boolean {
  return session !== null && ["super_admin", "admin", "sales"].includes(session.role);
}

// 中核管理者（営業を除く）。出願フォーム編集・選考(コホート)操作に使う。
export function isCoreAdmin(session: AdminSession | null): boolean {
  return session !== null && ["super_admin", "admin"].includes(session.role);
}

export function isSuperAdmin(session: AdminSession | null): boolean {
  return session?.role === "super_admin";
}

export function isAuthenticated(session: AdminSession | null): boolean {
  return session !== null && session.isValid;
}

export function canWrite(session: AdminSession | null): boolean {
  return isAdmin(session);
}

export function canManageAccounts(session: AdminSession | null): boolean {
  return isSuperAdmin(session);
}

export async function verifyStudentOwnership(
  applicationNo: string,
  email: string,
): Promise<{ valid: boolean; applicationId?: string }> {
  if (!applicationNo || !email) return { valid: false };
  try {
    const app = await prisma.application.findFirst({
      where: { applicationNo, email },
      select: { id: true },
    });
    if (!app) return { valid: false };
    return { valid: true, applicationId: app.id };
  } catch {
    return { valid: false };
  }
}

export { checkRateLimit, getClientIp } from "@/lib/security";
