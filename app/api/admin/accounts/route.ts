import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hashPassword, PWD_VERSION_BCRYPT } from "@/lib/password";
import { AdminAccountCreateSchema, AdminAccountUpdateSchema } from "@/lib/schemas";
import { getClientIp } from "@/lib/security";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import crypto from "crypto";

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const users = await getTenantDb().adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    return NextResponse.json(users);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const parsed = AdminAccountCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { username, password, displayName, role } = parsed.data;
    const db = getTenantDb();
    const exists = await db.adminUser.findFirst({ where: { username } });
    if (exists) {
      return NextResponse.json(
        { error: "このユーザー名は既に使用されています" },
        { status: 409 },
      );
    }
    const passwordHash = await hashPassword(password);
    const user = await db.adminUser.create({
      data: {
        id: crypto.randomUUID(),
        username,
        passwordHash,
        passwordVersion: PWD_VERSION_BCRYPT,
        displayName,
        role,
        isActive: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    await logAudit(session, {
      action: AUDIT_ACTIONS.ACCOUNT_CREATE,
      targetType: "User", targetId: user.id, targetLabel: `${user.displayName}（${user.username}）`,
      summary: `アカウント「${user.displayName}（${user.username}）」を作成（${user.role}）`,
      ip: getClientIp(request),
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
});

export const PATCH = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

    const parsed = AdminAccountUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = getTenantDb();
    // --- 自己ロックアウト / 最後の super_admin 喪失を防止 ---
    // 対象が自分自身 or super_admin を降格/無効化するケースを検査。
    const target = await db.adminUser.findFirst({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
    if (!target) {
      return NextResponse.json({ error: "対象アカウントが見つかりません" }, { status: 404 });
    }
    const demotingFromSuper =
      target.role === "super_admin" &&
      parsed.data.role !== undefined &&
      parsed.data.role !== "super_admin";
    const deactivating =
      target.role === "super_admin" && parsed.data.isActive === false;
    if (demotingFromSuper || deactivating) {
      // 他にアクティブな super_admin が残るか確認
      const otherActiveSupers = await db.adminUser.count({
        where: {
          role: "super_admin",
          isActive: true,
          id: { not: id },
        },
      });
      if (otherActiveSupers === 0) {
        return NextResponse.json(
          { error: "最後のスーパー管理者は降格・無効化できません。先に別のスーパー管理者を用意してください。" },
          { status: 400 },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.password) {
      data.passwordHash = await hashPassword(parsed.data.password);
      data.passwordVersion = PWD_VERSION_BCRYPT;
      data.tokenVersion = { increment: 1 }; // 改密で全既存トークン無効化
    }
    if (parsed.data.isActive === false) {
      data.tokenVersion = { increment: 1 }; // 無効化したアカウントの既存トークンも無効化
    }
    const user = await db.adminUser.update({
      where: { id },
      data,
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });
    await logAudit(session, {
      action: AUDIT_ACTIONS.ACCOUNT_UPDATE,
      targetType: "User", targetId: user.id, targetLabel: `${user.displayName}（${user.username}）`,
      summary: `アカウント「${user.displayName}（${user.username}）」を更新`,
      meta: {
        roleFrom: target.role, roleTo: parsed.data.role,
        isActive: parsed.data.isActive, passwordChanged: !!parsed.data.password,
      },
      ip: getClientIp(request),
    });
    return NextResponse.json(user);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});

export const DELETE = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    if (id === session?.userId) {
      return NextResponse.json(
        { error: "自分自身のアカウントは削除できません" },
        { status: 400 },
      );
    }
    const db = getTenantDb();
    const target = await db.adminUser.findFirst({ where: { id }, select: { displayName: true, username: true } });
    await db.adminUser.delete({ where: { id } });
    await logAudit(session, {
      action: AUDIT_ACTIONS.ACCOUNT_DELETE,
      targetType: "User", targetId: id, targetLabel: target ? `${target.displayName}（${target.username}）` : id,
      summary: `アカウント「${target ? `${target.displayName}（${target.username}）` : id}」を削除`,
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
});
