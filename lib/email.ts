import { ENV } from "@/lib/env";
import { logError } from "@/lib/logger";

/**
 * Resend API 経由でメール送信する共通ユーティリティ。
 *
 * 送信元は RESEND_FROM。未設定時は onboarding@resend.dev（テスト用・本人にしか届かない）。
 * 本番で出願者に届けるには Resend でドメイン認証が必要。
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  /** text か html の少なくとも一方は必須 */
  text?: string;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const DEFAULT_FROM = "Compass 出願 <onboarding@resend.dev>";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = ENV.RESEND_API_KEY;
  const from = ENV.RESEND_FROM || DEFAULT_FROM;

  if (!apiKey) {
    logError("sendEmail", new Error("RESEND_API_KEY not set"));
    return { ok: false, error: "メール送信が設定されていません（RESEND_API_KEY）" };
  }
  if (!input.to) {
    return { ok: false, error: "宛先がありません" };
  }
  if (!input.text && !input.html) {
    return { ok: false, error: "本文がありません" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        ...(input.text ? { text: input.text } : {}),
        ...(input.html ? { html: input.html } : {}),
      }),
    });
    const data = (await res.json()) as { id?: string; message?: string };
    if (!res.ok) {
      const msg = data.message || `Resend API error (${res.status})`;
      logError("sendEmail", new Error(msg));
      return { ok: false, error: msg };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    logError("sendEmail", err);
    return { ok: false, error: err instanceof Error ? err.message : "送信に失敗しました" };
  }
}

/**
 * Resend のバッチ API（/emails/batch, 1リクエスト最大100通）で一斉送信する。
 * 宛先は1通ずつ個別送信されるため、受信者同士にアドレスは公開されない。
 * 返り値は成功/失敗の件数。
 */
export async function sendBatch(
  items: SendEmailInput[],
): Promise<{ sent: number; failed: number }> {
  const apiKey = ENV.RESEND_API_KEY;
  const from = ENV.RESEND_FROM || DEFAULT_FROM;
  if (!apiKey) {
    logError("sendBatch", new Error("RESEND_API_KEY not set"));
    return { sent: 0, failed: items.length };
  }
  if (items.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const CHUNK = 100;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((it) => ({
            from,
            to: it.to,
            subject: it.subject,
            ...(it.text ? { text: it.text } : {}),
            ...(it.html ? { html: it.html } : {}),
          })),
        ),
      });
      const data = (await res.json()) as { data?: { id: string }[]; message?: string };
      if (res.ok) {
        const okCount = Array.isArray(data.data) ? data.data.length : chunk.length;
        sent += okCount;
        failed += chunk.length - okCount;
      } else {
        failed += chunk.length;
        logError("sendBatch", new Error(data.message || `Resend batch error (${res.status})`));
      }
    } catch (err) {
      failed += chunk.length;
      logError("sendBatch", err);
    }
  }
  return { sent, failed };
}

// ===== OC（オープンキャンパス）予約確認メール =====
export interface OCConfirmationInput {
  to: string;
  name: string;
  reservationNo: string;
  eventTitle: string;
  startAt: Date;
  location?: string | null;
  isOnline?: boolean;
  onlineUrl?: string | null;
  cancelUrl: string;
}

/** OC予約の確認メール（予約番号＋キャンセルリンク）。RESEND未設定なら sendEmail が no-op で {ok:false}。 */
export async function sendOCConfirmation(input: OCConfirmationInput): Promise<SendEmailResult> {
  const dt = input.startAt;
  const when = `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  const place = input.isOnline
    ? `オンライン${input.onlineUrl ? `（参加URL: ${input.onlineUrl}）` : ""}`
    : input.location || "（会場は追ってご案内します）";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
    <h2 style="color:#1d4ed8">オープンキャンパスのご予約を受け付けました</h2>
    <p>${esc(input.name)} 様</p>
    <p>下記の内容でご予約を承りました。当日お会いできるのを楽しみにしております。</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;background:#f3f4f6;width:120px">予約番号</td><td style="padding:8px"><b>${esc(input.reservationNo)}</b></td></tr>
      <tr><td style="padding:8px;background:#f3f4f6">イベント</td><td style="padding:8px">${esc(input.eventTitle)}</td></tr>
      <tr><td style="padding:8px;background:#f3f4f6">日時</td><td style="padding:8px">${esc(when)}</td></tr>
      <tr><td style="padding:8px;background:#f3f4f6">場所</td><td style="padding:8px">${esc(place)}</td></tr>
    </table>
    <p>ご都合が悪くなった場合は、下記からキャンセル・確認ができます。</p>
    <p><a href="${esc(input.cancelUrl)}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none">予約の確認・キャンセル</a></p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px">※このメールに心当たりがない場合は破棄してください。</p>
  </div>`;
  return sendEmail({ to: input.to, subject: `【オープンキャンパス予約完了】${input.eventTitle}（${input.reservationNo}）`, html });
}
