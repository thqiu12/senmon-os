import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { ChangeRequestReviewSchema } from "@/lib/schemas";
import { ALLOWED_FIELDS } from "@/lib/change-request-fields";
import { logError } from "@/lib/logger";

/**
 * 基本情報変更申請の承認 / 却下。管理者のみ。
 *
 * - approve: 承認 → Application 本体の該当フィールドを newValue で更新 + リクエストを「承認」状態へ
 * - reject : 却下 → リクエストを「却下」状態へ（Application は変更しない）
 *
 * 同じトランザクション内で実行し、片方失敗時は両方ロールバック。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; reqId: string } },
) {
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

  const parsed = ChangeRequestReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力エラー", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const req = await prisma.changeRequest.findUnique({ where: { id: params.reqId } });
    if (!req) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    if (req.applicationId !== params.id) {
      return NextResponse.json({ error: "申請が一致しません" }, { status: 400 });
    }
    if (req.status !== "申請中") {
      return NextResponse.json(
        { error: `既に「${req.status}」のため変更できません` },
        { status: 409 },
      );
    }

    // 承認時は ALLOWED_FIELDS チェック（POST 時のチェックを通過しているが念のため）
    if (parsed.data.action === "approve" && !ALLOWED_FIELDS[req.fieldKey]) {
      return NextResponse.json(
        { error: "対象フィールドの変更が許可されていません" },
        { status: 400 },
      );
    }

    // レビュアー識別: AdminUser.displayName か username を取得
    const reviewer = session
      ? await prisma.adminUser.findUnique({
          where: { id: session.userId },
          select: { displayName: true, username: true },
        })
      : null;
    const reviewerLabel = reviewer?.displayName || reviewer?.username || "管理者";

    const newStatus = parsed.data.action === "approve" ? "承認" : "却下";

    const updated = await prisma.$transaction(async (tx) => {
      // ChangeRequest を更新
      const r = await tx.changeRequest.update({
        where: { id: params.reqId },
        data: {
          status: newStatus,
          reviewedBy: reviewerLabel,
          reviewedAt: new Date(),
          reviewerNote: parsed.data.reviewerNote || null,
        },
      });

      // 承認なら Application 本体も更新 + adminNote として監査ログ記録
      if (parsed.data.action === "approve") {
        await tx.application.update({
          where: { id: params.id },
          data: {
            [req.fieldKey]: req.newValue,
          } as Record<string, unknown>,
        });
        await tx.adminNote.create({
          data: {
            applicationId: params.id,
            content: `[変更申請承認] ${req.fieldLabel}: 「${req.oldValue ?? "(空欄)"}」→「${req.newValue}」\n申請理由: ${req.reason || "(なし)"}\n承認メモ: ${parsed.data.reviewerNote || "(なし)"}`,
            author: reviewerLabel,
            // 学生にも変更が反映されたことを通知（マイページに自動表示）
            visibleToStudent: true,
          },
        });
      } else {
        await tx.adminNote.create({
          data: {
            applicationId: params.id,
            content: `[変更申請却下] ${req.fieldLabel}: 「${req.newValue}」への変更申請を却下しました\n申請理由: ${req.reason || "(なし)"}\n却下理由: ${parsed.data.reviewerNote || "(なし)"}`,
            author: reviewerLabel,
            visibleToStudent: true,
          },
        });
      }

      return r;
    });

    return NextResponse.json(updated);
  } catch (e) {
    logError("PATCH /api/applications/[id]/change-requests/[reqId]", e);
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }
}

/** 学生本人が誤って申請したものを取り下げる用途で DELETE を実装。 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; reqId: string } },
) {
  const session = await getSession(request);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* DELETE はボディ任意。学生は applicationNo/email を送る */
  }

  try {
    const req = await prisma.changeRequest.findUnique({ where: { id: params.reqId } });
    if (!req) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    if (req.applicationId !== params.id) {
      return NextResponse.json({ error: "申請が一致しません" }, { status: 400 });
    }
    if (req.status !== "申請中") {
      return NextResponse.json(
        { error: "既にレビュー済みのため取り下げできません" },
        { status: 409 },
      );
    }

    if (!isAdmin(session)) {
      const b = body as { applicationNo?: string; email?: string };
      if (!b.applicationNo || !b.email) {
        return NextResponse.json({ error: "認証情報が必要です" }, { status: 401 });
      }
      const app = await prisma.application.findUnique({
        where: { id: params.id },
        select: { applicationNo: true, email: true },
      });
      if (!app || app.applicationNo !== b.applicationNo || app.email !== b.email) {
        return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
      }
    }

    await prisma.changeRequest.delete({ where: { id: params.reqId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    logError("DELETE /api/applications/[id]/change-requests/[reqId]", e);
    return NextResponse.json({ error: "取り下げに失敗しました" }, { status: 500 });
  }
}
