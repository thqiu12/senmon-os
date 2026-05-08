import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export type AdminRole = "super_admin" | "admin" | "interviewer";

export interface AdminSession {
  userId: string;
  role: AdminRole;
  isValid: boolean;
}

// ---- トークン検証 ----
function verifyToken(token: string): { userId: string; role: string } | null {
  try {
    const secret = process.env.SESSION_SECRET || "senmon-secret-2024";
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length < 4) return null;
    const sig = parts[parts.length - 1];
    const payload = parts.slice(0, parts.length - 1).join(":");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig !== expected) return null;
    const [userId, role] = parts;
    return { userId, role };
  } catch {
    return null;
  }
}

// ---- セッション取得（DB照合あり）----
export async function getSession(request: NextRequest): Promise<AdminSession | null> {
  const token = request.cookies.get("admin_token")?.value;
  if (!token) return null;

  // 旧トークン形式（後方互換）
  const sessionSecret = process.env.SESSION_SECRET || "senmon-secret-2024";
  if (token === sessionSecret) {
    return { userId: "legacy", role: "super_admin", isValid: true };
  }

  const parsed = verifyToken(token);
  if (!parsed) return null;

  try {
    const user = await prisma.adminUser.findUnique({ where: { id: parsed.userId } });
    if (!user || !user.isActive) return null;
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
      where: { applicationNo, email: email },
      select: { id: true },
    });
    if (!app) return { valid: false };
    return { valid: true, applicationId: app.id };
  } catch {
    return { valid: false };
  }
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
