import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escapeHtml } from "@/lib/security";
import { AnnouncementCreateSchema } from "@/lib/schemas";
import { logError, logger } from "@/lib/logger";
import { sendBatch } from "@/lib/email";
import { ENV } from "@/lib/env";
import { buildRecipientWhere } from "@/lib/announcement-targeting";
import { hasCapability } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(announcements);
  } catch (error) {
    logError("GET /api/announcements", error);
    return NextResponse.json({ error: "一覧の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const parsed = AnnouncementCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const announcement = await prisma.announcement.create({
      data: { ...parsed.data, createdBy: session?.userId ?? "管理者" },
    });
    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    logError("POST /api/announcements", error);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const action = searchParams.get("action");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

    if (action === "send") {
      if (!(await hasCapability(session, "announcement.send"))) {
        return NextResponse.json({ error: "お知らせ送信の権限がありません" }, { status: 403 });
      }
      return await handleSend(id);
    }

    const body = await request.json();
    const updateSchema = AnnouncementCreateSchema.partial();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const updated = await prisma.announcement.update({ where: { id }, data: parsed.data });
    return NextResponse.json(updated);
  } catch (error) {
    logError("PATCH /api/announcements", error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

// 未送信のお知らせのみ削除可。送信済みは操作ログとして必ず保持する。
export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

    // sentAt=null 条件付きの deleteMany で原子的に「未送信のみ削除」。
    // （送信済みを誤って消さない／レース時も安全）
    const result = await prisma.announcement.deleteMany({ where: { id, sentAt: null } });
    if (result.count === 0) {
      const existing = await prisma.announcement.findUnique({
        where: { id },
        select: { sentAt: true },
      });
      if (existing?.sentAt) {
        return NextResponse.json(
          { error: "送信済みのお知らせは削除できません（履歴として保持されます）" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("DELETE /api/announcements", error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}

async function handleSend(id: string) {
  // メール送信は Resend に統一。未設定なら送信済みフラグを立てずに 503 を返す（後で再送可能）。
  if (!ENV.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "メール送信が設定されていません（RESEND_API_KEY）" },
      { status: 503 },
    );
  }

  // 幂等：既送信なら拒否（sentAt を claim）
  const claim = await prisma.announcement.updateMany({
    where: { id, sentAt: null },
    data: { sentAt: new Date() },
  });
  if (claim.count === 0) {
    return NextResponse.json({ error: "既に送信済みです" }, { status: 409 });
  }

  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) {
    return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
  }

  const where = buildRecipientWhere({
    targetType: announcement.targetType,
    // レガシー(specific_cohort/status_filter)も新フィルタも、保存済みの各列をそのまま使う
    targetCohortId: announcement.targetCohortId,
    targetSchool: announcement.targetSchool,
    targetStatus: announcement.targetStatus,
  });

  const recipients = await prisma.application.findMany({
    where,
    select: { email: true },
    distinct: ["email"],
  });
  const emails = recipients.map((r) => r.email).filter((e): e is string => !!e);

  const subject = `【お知らせ】${announcement.title}`;
  const titleSafe = escapeHtml(announcement.title);
  const contentSafe = escapeHtml(announcement.content);
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background:#f5f5f5; margin:0; padding:20px;">
  <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden;">
    <div style="background:#1e3a5f; color:#fff; padding:24px 32px;">
      <h1 style="margin:0; font-size:20px; font-weight:700;">${titleSafe}</h1>
      <p style="margin:4px 0 0; font-size:13px; opacity:0.8;">Compass｜入学出願システム</p>
    </div>
    <div style="padding:32px;">
      <div style="font-size:15px; line-height:1.8; color:#333; white-space:pre-line;">${contentSafe}</div>
    </div>
  </div>
</body></html>`;

  // Resend バッチ送信（宛先は1通ずつ個別送信＝アドレス非開示）
  const { sent: sentCount, failed: failCount } = await sendBatch(
    emails.map((to) => ({ to, subject, html })),
  );

  // 全件失敗（誰にも届いていない）なら送信済みフラグを戻し、再送可能にする。
  // 1件でも成功していれば戻さない（受信者単位の重複排除が無く、再送は二重送信になるため）。
  const allFailed = sentCount === 0 && failCount > 0;
  await prisma.announcement.update({
    where: { id },
    data: { sentCount, ...(allFailed ? { sentAt: null } : {}) },
  });

  logger.info({ id, targets: emails.length, sentCount, failCount, allFailed }, "announcement sent (resend)");
  if (allFailed) {
    return NextResponse.json(
      { error: "送信に失敗しました。時間をおいて再送してください。", targets: emails.length, sentCount: 0, failCount },
      { status: 502 },
    );
  }
  return NextResponse.json({
    success: true,
    provider: "resend",
    targets: emails.length,
    sentCount,
    failCount,
  });
}
