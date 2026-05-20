import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEnrollmentYears, getSetting, setSetting } from "@/lib/settings";
import { logError } from "@/lib/logger";

/**
 * 管理画面で扱うシステム設定。GET でフル取得、PUT で更新。
 *
 * セッションは管理者必須。
 */

const SettingsSchema = z.object({
  enrollmentYears: z.array(z.string().regex(/^\d{4}$/, "西暦4桁で入力してください")).min(1).max(20).optional(),
  enrollmentMonth: z.string().regex(/^(1[0-2]|[1-9])$/, "1〜12 の月を指定してください").optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const [enrollmentYears, enrollmentMonth] = await Promise.all([
      getEnrollmentYears(),
      getSetting("enrollmentMonth"),
    ]);
    // 最終更新情報も併せて
    const meta = await prisma.systemSetting.findMany({
      select: { key: true, updatedAt: true, updatedBy: true },
    });
    return NextResponse.json({
      enrollmentYears,
      enrollmentMonth,
      meta,
    });
  } catch (e) {
    logError("GET /api/admin/settings", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正な JSON" }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力エラー", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    // 操作者ラベル取得
    const me = session ? await prisma.adminUser.findUnique({
      where: { id: session.userId },
      select: { displayName: true, username: true },
    }) : null;
    const editor = me?.displayName || me?.username || "管理者";

    if (parsed.data.enrollmentYears !== undefined) {
      // 重複排除 + ソート
      const cleaned = Array.from(new Set(parsed.data.enrollmentYears)).sort();
      await setSetting("enrollmentYears", cleaned, editor);
    }
    if (parsed.data.enrollmentMonth !== undefined) {
      await setSetting("enrollmentMonth", parsed.data.enrollmentMonth, editor);
    }

    // 更新後の値を返す
    const [enrollmentYears, enrollmentMonth] = await Promise.all([
      getEnrollmentYears(),
      getSetting("enrollmentMonth"),
    ]);
    return NextResponse.json({
      success: true,
      enrollmentYears,
      enrollmentMonth,
    });
  } catch (e) {
    logError("PUT /api/admin/settings", e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
