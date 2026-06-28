import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin, verifyStudentOwnership } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { FeePatchSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";

// 学生本人が変更してよいフィールド: 自身の振込証明書 + 状態(確認中)
const STUDENT_ALLOWED = new Set(["examFeeAmount", "examFeeReceiptUrl", "examFeeStatus"]);
const STUDENT_ALLOWED_STATUS = new Set(["未払い", "確認中"]);

export const PATCH = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正な JSON" }, { status: 400 });
  }
  // 学生本人の場合は body から applicationNo + email を取り出して所有権チェック
  const isAdminSession = isAdmin(session);
  if (!isAdminSession) {
    const b = body as { applicationNo?: string; email?: string };
    if (!b.applicationNo || !b.email) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const own = await verifyStudentOwnership(b.applicationNo, b.email);
    if (!own.valid || own.applicationId !== params.id) {
      return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
    }
  }

  // FeePatchSchema は strict なので applicationNo / email を除去してから検証
  const rawData = body as Record<string, unknown>;
  const cleanData: Record<string, unknown> = {};
  for (const k of Object.keys(rawData)) {
    if (k === "applicationNo" || k === "email") continue;
    cleanData[k] = rawData[k];
  }

  const parsed = FeePatchSchema.safeParse(cleanData);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力エラー", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 学生は許可フィールド + 状態は未払い/確認中 のみ
  if (!isAdminSession) {
    for (const k of Object.keys(parsed.data)) {
      if (!STUDENT_ALLOWED.has(k)) {
        return NextResponse.json(
          { error: `フィールド '${k}' は管理者のみ変更できます` },
          { status: 403 },
        );
      }
    }
    if (parsed.data.examFeeStatus && !STUDENT_ALLOWED_STATUS.has(parsed.data.examFeeStatus)) {
      return NextResponse.json(
        { error: "学生は examFeeStatus を '確認中' までしか変更できません" },
        { status: 403 },
      );
    }
  }

  try {
    const updated = await getTenantDb().application.update({
      where: { id: params.id },
      data: parsed.data,
      select: { id: true, examFeeStatus: true, examFeeAmount: true, examFeeReceiptUrl: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    logError("PATCH /api/applications/[id]/fee", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});
