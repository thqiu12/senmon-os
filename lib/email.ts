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
