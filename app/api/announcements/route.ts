import { getSession, isAdmin } from "@/lib/auth";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

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
    console.error("GET /api/announcements error:", error);
    return NextResponse.json({ error: "一覧の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (!body.title || !body.content) {
      return NextResponse.json({ error: "タイトルと本文は必須です" }, { status: 400 });
    }

    const announcement = await prisma.announcement.create({
      data: {
        id: crypto.randomUUID(),
        title: body.title,
        content: body.content,
        targetType: body.targetType || "all",
        targetCohortId: body.targetCohortId || null,
        targetStatus: body.targetStatus || null,
        createdBy: "管理者",
      },
    });
    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    console.error("POST /api/announcements error:", error);
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

    if (!id) {
      return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    }

    if (action === "send") {
      const announcement = await prisma.announcement.findUnique({ where: { id } });
      if (!announcement) {
        return NextResponse.json({ error: "お知らせが見つかりません" }, { status: 404 });
      }

      // 対象者のメールアドレスを取得
      const where: Record<string, unknown> = {};
      if (announcement.targetType === "合格者") {
        where.status = { in: ["合格", "補欠合格"] };
      } else if (announcement.targetType === "specific_cohort" && announcement.targetCohortId) {
        where.cohortId = announcement.targetCohortId;
      } else if (announcement.targetType === "status_filter" && announcement.targetStatus) {
        where.status = announcement.targetStatus;
      }

      const applications = await prisma.application.findMany({
        where,
        select: { email: true, lastName: true, firstName: true },
      });

      const emailSet = new Set(applications.map(a => a.email));
      const emails = Array.from(emailSet);

      // SMTP設定確認
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || smtpUser;

      let sentCount = 0;
      if (smtpHost && smtpUser && smtpPass && emails.length > 0) {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const subject = `【お知らせ】${announcement.title}`;
        const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1e3a5f; color: #fff; padding: 24px 32px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">${announcement.title}</h1>
      <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.8;">専門学校 入学出願システム</p>
    </div>
    <div style="padding: 32px;">
      <div style="font-size: 15px; line-height: 1.8; color: #333; white-space: pre-line;">${announcement.content}</div>
      <div style="background: #f0f4f8; border-radius: 4px; padding: 12px 16px; margin-top: 24px; font-size: 12px; color: #888;">
        ご不明な点は入学相談室（平日9:00〜17:00）までお問い合わせください。
      </div>
    </div>
  </div>
</body>
</html>`;

        for (const email of emails) {
          try {
            await transporter.sendMail({ from: smtpFrom, to: email, subject, html });
            sentCount++;
          } catch (e) {
            console.error(`メール送信失敗 (${email}):`, e);
          }
        }
      }

      const updated = await prisma.announcement.update({
        where: { id },
        data: {
          sentAt: new Date(),
          sentCount: emails.length,
        },
      });

      return NextResponse.json({
        success: true,
        sentCount: emails.length,
        emailsSent: sentCount,
        announcement: updated,
        smtpEnabled: !!(smtpHost && smtpUser && smtpPass),
      });
    }

    // 通常更新
    const body = await request.json();
    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.content !== undefined && { content: body.content }),
        ...(body.targetType !== undefined && { targetType: body.targetType }),
        ...(body.targetCohortId !== undefined && { targetCohortId: body.targetCohortId }),
        ...(body.targetStatus !== undefined && { targetStatus: body.targetStatus }),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/announcements error:", error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
