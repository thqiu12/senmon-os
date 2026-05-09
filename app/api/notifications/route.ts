import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSession, isAdmin } from "@/lib/auth";
import { NotificationSchema } from "@/lib/schemas";
import { escapeHtml } from "@/lib/security";
import { ENV } from "@/lib/env";
import { z } from "zod";

type NotificationPayload = z.infer<typeof NotificationSchema>;

function getPortalUrl(applicationNo: string, email: string): string {
  const base = ENV.PUBLIC_BASE_URL || "http://localhost:3000";
  const params = new URLSearchParams({ applicationNo, email });
  return `${base}/apply/status?${params.toString()}`;
}

const e = escapeHtml;

function buildSubjectAndHtml(payload: NotificationPayload): { subject: string; html: string } {
  const { applicantName, applicationNo, applicantEmail = payload.to } = payload;
  const portalUrl = getPortalUrl(applicationNo, applicantEmail);
  const portalUrlSafe = e(portalUrl);
  const applicantNameSafe = e(applicantName);
  const applicationNoSafe = e(applicationNo);

  const portalButton = (label: string, color: string) => `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${portalUrlSafe}" style="display: inline-block; background: ${color}; color: #fff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 8px; letter-spacing: 0.5px;">
        ${label}
      </a>
      <p style="margin: 10px 0 0; font-size: 12px; color: #999;">
        ボタンが開かない場合は以下のURLをブラウザに貼り付けてください：<br>
        <a href="${portalUrlSafe}" style="color: #666; word-break: break-all;">${portalUrlSafe}</a>
      </p>
    </div>`;

  // ===== 面接案内 =====
  if (payload.type === "interview") {
    const subject = `【面接のご案内】${applicationNo} ${applicantName} 様`;
    const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1e3a5f; color: #fff; padding: 24px 32px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">面接のご案内</h1>
      <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.8;">専門学校 入学出願システム</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 15px; line-height: 1.7;">${applicantNameSafe} 様</p>
      <p style="color: #333; font-size: 15px; line-height: 1.7;">
        この度は弊校へのご出願ありがとうございます。<br>
        書類審査の結果、下記の日程にて面接を実施することになりました。
      </p>
      <div style="background: #f8f9fa; border-left: 4px solid #1e3a5f; border-radius: 4px; padding: 20px 24px; margin: 24px 0;">
        <h2 style="margin: 0 0 16px; font-size: 16px; color: #1e3a5f;">面接詳細</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #666; width: 100px; vertical-align: top;">日付</td>
            <td style="padding: 6px 0; color: #333; font-weight: 600;">${e(payload.interviewDate) || "—"}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #666;">時間</td>
            <td style="padding: 6px 0; color: #333; font-weight: 600;">${e(payload.interviewTime) || "—"}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #666;">場所</td>
            <td style="padding: 6px 0; color: #333; font-weight: 600;">${e(payload.interviewPlace) || "—"}</td>
          </tr>
          ${payload.interviewNotes ? `
          <tr>
            <td style="padding: 6px 0; color: #666; vertical-align: top;">注意事項</td>
            <td style="padding: 6px 0; color: #333; white-space: pre-line;">${e(payload.interviewNotes)}</td>
          </tr>` : ""}
        </table>
      </div>
      ${portalButton("出願状況を確認する →", "#1e3a5f")}
      <p style="color: #555; font-size: 13px; line-height: 1.7;">
        ご不明な点がございましたら、入学相談室（平日9:00〜17:00）までお問い合わせください。
      </p>
      <div style="background: #f0f4f8; border-radius: 4px; padding: 12px 16px; margin-top: 24px; font-size: 12px; color: #888;">
        申請番号：${applicationNoSafe}
      </div>
    </div>
  </div>
</body>
</html>`;
    return { subject, html };
  }

  // ===== 合否通知 =====
  if (payload.type === "result") {
    const isPass = payload.resultStatus === "合格";
    const isHokketsu = payload.resultStatus === "補欠合格";
    const headerColor = isPass ? "#166534" : isHokketsu ? "#92400e" : "#374151";
    const subject = isPass
      ? `【合格通知】${applicationNo} ${applicantName} 様`
      : isHokketsu
      ? `【補欠合格のご通知】${applicationNo} ${applicantName} 様`
      : `【審査結果のご連絡】${applicationNo} ${applicantName} 様`;

    const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: ${headerColor}; color: #fff; padding: 24px 32px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">${isPass ? "合格通知" : isHokketsu ? "補欠合格のご通知" : "審査結果のご連絡"}</h1>
      <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.8;">専門学校 入学出願システム</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 15px; line-height: 1.7;">${applicantNameSafe} 様</p>

      ${isPass ? `
      <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 24px; margin: 20px 0; text-align: center;">
        <p style="font-size: 32px; margin: 0 0 8px;">🎉</p>
        <p style="color: #166534; font-size: 20px; font-weight: 700; margin: 0 0 8px;">合格おめでとうございます！</p>
        <p style="color: #15803d; font-size: 14px; margin: 0;">書類審査・面接の結果、合格と決定いたしました。</p>
      </div>

      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 16px 20px; margin: 20px 0;">
        <p style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 6px;">📋 次のステップ：入学手続きを完了してください</p>
        <p style="color: #78350f; font-size: 13px; line-height: 1.8; margin: 0;">
          入学手続きポータルから以下の手続きをオンラインで完了できます：<br>
          ① 必要書類のアップロード（誓約書・健康診断書・パスポートなど）<br>
          ② 入学誓約書への電子署名<br>
          ③ 手続き完了の報告
        </p>
      </div>
      ${portalButton("入学手続きポータルへ →", "#166534")}
      <p style="color: #555; font-size: 13px; line-height: 1.7;">
        ※ ポータルでは手続きの進捗状況もリアルタイムで確認できます。<br>
        ご不明な点がございましたら、入学相談室（平日9:00〜17:00）までお問い合わせください。
      </p>
      ` : isHokketsu ? `
      <div style="background: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px 24px; margin: 20px 0;">
        <p style="color: #92400e; font-size: 18px; font-weight: 700; margin: 0 0 12px;">📋 補欠合格のご通知</p>
        <p style="color: #78350f; font-size: 14px; line-height: 1.8; margin: 0;">
          審査の結果、あなたの実力は<strong>合格基準を十分に満たしています</strong>。<br>
          ただし、今回は定員の関係により、補欠合格というかたちでのご通知となりました。
        </p>
      </div>
      <div style="background: #fef9c3; border-left: 4px solid #eab308; border-radius: 4px; padding: 16px 20px; margin: 16px 0;">
        <p style="color: #713f12; font-size: 14px; font-weight: 700; margin: 0 0 8px;">📌 今後の流れ</p>
        <p style="color: #78350f; font-size: 13px; line-height: 1.8; margin: 0;">
          他の合格者の入学辞退が発生した場合は、速やかにご連絡し、正式合格をご案内いたします。
        </p>
      </div>
      ${portalButton("出願状況を確認する →", "#92400e")}
      ` : `
      <p style="color: #333; font-size: 15px; line-height: 1.7;">
        この度は弊校へのご出願ありがとうございました。<br>
        慎重に審査を行いました結果、誠に残念ながら今回はご期待に添えない結果となりました。
      </p>
      <p style="color: #555; font-size: 14px; line-height: 1.7;">
        ご縁がなかったことは大変申し訳なく思っております。今後のご活躍を心よりお祈り申し上げます。
      </p>
      `}

      <div style="background: #f0f4f8; border-radius: 4px; padding: 12px 16px; margin-top: 24px; font-size: 12px; color: #888;">
        申請番号：${applicationNoSafe}
      </div>
    </div>
  </div>
</body>
</html>`;
    return { subject, html };
  }

  // ===== 入学手続き案内 =====
  const subject = `【入学手続きのご案内】${applicationNo} ${applicantName} 様`;
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1e3a5f; color: #fff; padding: 24px 32px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">入学手続きのご案内</h1>
      <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.8;">専門学校 入学出願システム</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 15px; line-height: 1.7;">${applicantNameSafe} 様</p>
      <p style="color: #333; font-size: 15px; line-height: 1.7;">
        入学手続きに関するご案内の準備が整いました。<br>
        下記の内容をご確認の上、<strong>期日までにオンラインで手続きを完了</strong>してください。
      </p>

      ${payload.deadline ? `
      <div style="background: #fff8e1; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 16px 20px; margin: 20px 0;">
        <p style="margin: 0; font-size: 15px; color: #92400e; font-weight: 700;">⏰ 手続き期限：${e(payload.deadline)}</p>
      </div>` : ""}

      <div style="background: #f0f7ff; border-radius: 8px; padding: 20px 24px; margin: 16px 0;">
        <p style="color: #1e40af; font-size: 14px; font-weight: 700; margin: 0 0 12px;">📋 オンラインで完了できる手続き</p>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 4px; color: #1e3a5f; width: 24px;">①</td>
            <td style="padding: 6px 0; color: #1e3a5f;">必要書類のアップロード（誓約書・健康診断書・パスポートなど）</td>
          </tr>
          <tr>
            <td style="padding: 6px 4px; color: #1e3a5f;">②</td>
            <td style="padding: 6px 0; color: #1e3a5f;">入学誓約書への電子署名</td>
          </tr>
          <tr>
            <td style="padding: 6px 4px; color: #1e3a5f;">③</td>
            <td style="padding: 6px 0; color: #1e3a5f;">手続き完了の報告</td>
          </tr>
        </table>
      </div>

      ${payload.instructions ? `
      <div style="background: #f8f9fa; border-radius: 4px; padding: 20px 24px; margin: 16px 0; font-size: 14px; color: #333; line-height: 1.8; white-space: pre-line;">
${e(payload.instructions)}
      </div>` : ""}

      ${portalButton("今すぐ入学手続きを始める →", "#1e3a5f")}

      <p style="color: #555; font-size: 13px; line-height: 1.7;">
        ※ ポータルでは手続きの進捗状況をリアルタイムで確認できます。<br>
        ご不明な点がございましたら、入学相談室（平日9:00〜17:00）までお問い合わせください。
      </p>
      <div style="background: #f0f4f8; border-radius: 4px; padding: 12px 16px; margin-top: 24px; font-size: 12px; color: #888;">
        申請番号：${applicationNoSafe}
      </div>
    </div>
  </div>
</body>
</html>`;
  return { subject, html };
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const parsed = NotificationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body: NotificationPayload = {
      ...parsed.data,
      applicantEmail: parsed.data.applicantEmail || parsed.data.to,
    };

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json({
        success: true,
        emailSent: false,
        reason: "SMTP未設定",
      });
    }

    const { subject, html } = buildSubjectAndHtml(body);

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: body.to,
      subject,
      html,
    });

    return NextResponse.json({ success: true, emailSent: true });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json(
      { error: "メールの送信に失敗しました" },
      { status: 500 }
    );
  }
}
