import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin, verifyStudentOwnership } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { ChangeRequestCreateSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { ALLOWED_FIELDS } from "@/lib/change-request-fields";

/**
 * 基本情報変更申請: 出願者が出願後に基本情報（住所・電話番号等）の変更を申請する。
 * - POST : 学生本人 OR 管理者が新規作成
 * - GET  : 学生本人（自分の申請）OR 管理者（全申請）が取得
 *
 * 承認/却下は /api/applications/[id]/change-requests/[reqId] (PATCH) で行う。
 */

// ALLOWED_FIELDS は lib/change-request-fields.ts に切り出し済み（route.ts から export 不可のため）

export const GET = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);

  try {
    if (!isAdmin(session)) {
      // 学生本人: applicationNo + email で所有権確認
      const { searchParams } = new URL(request.url);
      const applicationNo = searchParams.get("applicationNo");
      const email = searchParams.get("email");
      if (!applicationNo || !email) {
        return NextResponse.json({ error: "認証情報が必要です" }, { status: 401 });
      }
      const own = await verifyStudentOwnership(applicationNo, email);
      if (!own.valid || own.applicationId !== params.id) {
        return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
      }
    }

    const items = await getTenantDb().changeRequest.findMany({
      where: { applicationId: params.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(items);
  } catch (e) {
    logError("GET /api/applications/[id]/change-requests", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

export const POST = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`change-req:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正な JSON" }, { status: 400 });
  }

  const session = await getSession(request);
  const isAdminSession = isAdmin(session);

  // 学生からの場合は所有権確認
  if (!isAdminSession) {
    const b = body as { applicationNo?: string; email?: string };
    if (!b.applicationNo || !b.email) {
      return NextResponse.json({ error: "認証情報が必要です" }, { status: 401 });
    }
    const own = await verifyStudentOwnership(b.applicationNo, b.email);
    if (!own.valid || own.applicationId !== params.id) {
      return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
    }
  }

  const parsed = ChangeRequestCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力エラー", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { fieldKey, newValue, reason } = parsed.data;

  // 許可フィールドのみ受付
  const fieldDef = ALLOWED_FIELDS[fieldKey];
  if (!fieldDef) {
    return NextResponse.json({ error: "このフィールドは変更申請できません" }, { status: 400 });
  }

  // select 型の値域チェック
  if (fieldDef.type === "select" && fieldDef.options && !fieldDef.options.includes(newValue)) {
    return NextResponse.json({ error: `「${fieldDef.label}」の値が不正です` }, { status: 400 });
  }

  const db = getTenantDb();

  // 現在値を取得
  const app = await db.application.findFirst({
    where: { id: params.id },
    select: {
      [fieldKey]: true,
    } as Record<string, true>,
  });
  if (!app) {
    return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
  }
  const oldValueRaw = (app as Record<string, unknown>)[fieldKey];
  const oldValue = oldValueRaw == null ? null : String(oldValueRaw);

  if (oldValue === newValue) {
    return NextResponse.json({ error: "現在の値と同じです" }, { status: 400 });
  }

  // 同じフィールドで申請中のリクエストが既にあれば、新規追加を拒否（重複防止）
  const dup = await db.changeRequest.findFirst({
    where: { applicationId: params.id, fieldKey, status: "申請中" },
  });
  if (dup) {
    return NextResponse.json(
      { error: `「${fieldDef.label}」は既に変更申請中です（リクエスト #${dup.id.slice(0, 8)}）` },
      { status: 409 },
    );
  }

  try {
    const created = await db.changeRequest.create({
      data: {
        applicationId: params.id,
        fieldKey,
        fieldLabel: fieldDef.label,
        oldValue,
        newValue,
        reason: reason || null,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    logError("POST /api/applications/[id]/change-requests", e);
    return NextResponse.json({ error: "申請の作成に失敗しました" }, { status: 500 });
  }
});

// 許可フィールド定義を公開して、UI 側でドロップダウン生成等に再利用できるよう OPTIONS で返す
export async function OPTIONS() {
  return NextResponse.json({
    fields: Object.entries(ALLOWED_FIELDS).map(([key, def]) => ({ key, ...def })),
  });
}
