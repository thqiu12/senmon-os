import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ENV } from "@/lib/env";
import crypto from "crypto";

export type AdminRole = "super_admin" | "admin" | "interviewer";

export interface AdminSession {
  userId: string;
  role: AdminRole;
  isValid: boolean;
}

export function makeSessionToken(userId: string, role: string): string {
  const payload = `${userId}:${role}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", ENV.SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

function verifyToken(token: string): { userId: string; role: string } | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length < 4) return null;
    const sig = parts[parts.length - 1];
    const payload = parts.slice(0, parts.length - 1).join(":");
    const expected = crypto.createHmac("sha256", ENV.SESSION_SECRET).update(payload).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    const [userId, role] = parts;
    return { userId, role };
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
    return { userId: user.id, role: user.role as AdminRole, isValid: true };
  } catch {
    return null;
  }
}

export function isAdmin(session: AdminSession | null): boolean {
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
