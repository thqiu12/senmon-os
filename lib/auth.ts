import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export type AdminRole = "super_admin" | "admin" | "interviewer";
export const ADMIN_ROLES: AdminRole[] = ["super_admin", "admin", "interviewer"];

export interface AdminSession {
  userId: string;
  role: AdminRole;
  isValid: boolean;
}

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === "string" && (ADMIN_ROLES as string[]).includes(role);
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

// セッションの有効期間（発行時刻から）
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * 署名用シークレットを取得する。
 * 未設定 or 短すぎる場合は例外を投げて「フェイルクローズ」する
 * （ハードコードのフォールバックは絶対に使わない）。
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET が未設定、または短すぎます。16文字以上のランダムな値を環境変数に設定してください。"
    );
  }
  return secret;
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** ログイン成功時に発行する署名付きトークンを生成する。 */
export function createSessionToken(userId: string, role: string): string {
  const secret = getSessionSecret();
  const payload = `${userId}:${role}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

// ---- トークン検証 ----
function verifyToken(token: string): { userId: string; role: string } | null {
  try {
    const secret = getSessionSecret();
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length < 4) return null;
    const sig = parts[parts.length - 1];
    const payload = parts.slice(0, parts.length - 1).join(":");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (!safeEqualHex(sig, expected)) return null;

    const [userId, role, issuedAtStr] = parts;
    // サーバ側で有効期限を検証（cookie の maxAge はクライアント改変可能なため信頼しない）
    const issuedAt = Number(issuedAtStr);
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) return null;

    return { userId, role };
  } catch {
    return null;
  }
}

// ---- セッション取得（DB照合あり）----
export async function getSession(request: NextRequest): Promise<AdminSession | null> {
  const token = request.cookies.get("admin_token")?.value;
  if (!token) return null;

  const parsed = verifyToken(token);
  if (!parsed) return null;

  try {
    const user = await prisma.adminUser.findUnique({ where: { id: parsed.userId } });
    if (!user || !user.isActive) return null;
    if (!isAdminRole(user.role)) return null;
    return { userId: user.id, role: user.role as AdminRole, isValid: true };
  } catch {
    return null;
  }
}

// ---- 権限チェック関数 ----

/** super_admin または admin */
export function isAdmin(session: AdminSession | null): boolean {
  return session !== null && ["super_admin", "admin"].includes(session.role);
}

/** super_admin のみ */
export function isSuperAdmin(session: AdminSession | null): boolean {
  return session?.role === "super_admin";
}

/** 全ロール（interviewer含む）*/
export function isAuthenticated(session: AdminSession | null): boolean {
  return session !== null && session.isValid;
}

/** 申請の書き込み権限（admin以上）*/
export function canWrite(session: AdminSession | null): boolean {
  return isAdmin(session);
}

/** アカウント管理権限 */
export function canManageAccounts(session: AdminSession | null): boolean {
  return isSuperAdmin(session);
}

// ---- 学生認証：申請番号+メールで本人確認 ----
export async function verifyStudentOwnership(
  applicationNo: string,
  email: string
): Promise<{ valid: boolean; applicationId?: string }> {
  if (!applicationNo || !email) return { valid: false };
  try {
    const app = await prisma.application.findFirst({
      where: { applicationNo: applicationNo.trim(), email: email.trim() },
      select: { id: true },
    });
    if (!app) return { valid: false };
    return { valid: true, applicationId: app.id };
  } catch {
    return { valid: false };
  }
}

export async function verifyApplicationStudentAccess(
  applicationId: string,
  applicationNo: string,
  email: string
): Promise<boolean> {
  if (!applicationId || !applicationNo || !email) return false;
  const ownership = await verifyStudentOwnership(applicationNo, email);
  return ownership.valid && ownership.applicationId === applicationId;
}

// ---- レートリミット（メモリ、シンプル版）----
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxReq = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true; // OK
  }
  entry.count++;
  if (entry.count > maxReq) return false; // Over limit
  return true;
}

// 古いエントリを定期的に削除（メモリリーク防止）
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((val, key) => {
    if (now > val.resetAt) rateLimitMap.delete(key);
  });
}, 5 * 60 * 1000);
