// =============================================================================
// Google Ads オフラインコンバージョン送信（設定駆動・未設定なら no-op）
//   - adsEnabled(): 認証6点が揃っているか。未設定なら送信経路は何もしない。
//   - buildClickConversion / formatAdsDateTime: 純関数（unit テスト対象）。
//   - uploadClickConversion: OAuth → uploadClickConversions API。例外は握って
//     {ok:false} を返す（呼び出し側の作成処理を絶対に壊さない）。
//   - DB 書き込みなし・外部送信のみ。tenant 非依存。
// =============================================================================
import { logError } from "@/lib/logger";

const GOOGLE_ADS_API_VERSION = "v17";

// process.env を直接読む（テストの stubEnv を効かせるため。ENV 経由にしない）
function creds() {
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID || "",
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "",
  };
}

export function adsEnabled(): boolean {
  const c = creds();
  return !!(c.developerToken && c.clientId && c.clientSecret && c.refreshToken && c.customerId);
}

/** Date → Google Ads の conversionDateTime 形式 "yyyy-MM-dd HH:mm:ss+09:00"（JST 壁時計）。 */
export function formatAdsDateTime(date: Date, tz = "+09:00"): string {
  // UTC に +9h して getUTC* で読むと JST の壁時計値になる（環境 TZ 非依存で決定的）。
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${jst.getUTCFullYear()}-${p(jst.getUTCMonth() + 1)}-${p(jst.getUTCDate())} ` +
    `${p(jst.getUTCHours())}:${p(jst.getUTCMinutes())}:${p(jst.getUTCSeconds())}${tz}`
  );
}

/** クリックコンバージョン1件のオブジェクトを組む（純関数）。 */
export function buildClickConversion(opts: {
  gclid: string;
  conversionActionId: string;
  customerId: string;
  conversionDateTime: string;
  value?: number;
  currency?: string;
}): Record<string, unknown> {
  const conv: Record<string, unknown> = {
    conversionAction: `customers/${opts.customerId}/conversionActions/${opts.conversionActionId}`,
    gclid: opts.gclid,
    conversionDateTime: opts.conversionDateTime,
  };
  if (opts.value != null) {
    conv.conversionValue = opts.value;
    conv.currencyCode = opts.currency ?? "JPY";
  }
  return conv;
}

/** OAuth refresh_token → access_token。失敗時は null。 */
async function getAccessToken(): Promise<string | null> {
  const c = creds();
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        refresh_token: c.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      logError("Google Ads OAuth token 取得失敗", new Error(`status ${res.status}`), {});
      return null;
    }
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch (e) {
    logError("Google Ads OAuth token 例外", e, {});
    return null;
  }
}

/**
 * gclid 付きコンバージョンを Google Ads に送信。
 * adsEnabled()==false / gclid 空 / conversionActionId 空 のいずれかで no-op（{ok:false}）。
 * 例外は握って {ok:false,error} を返す（呼び出し側の作成を壊さない）。
 */
export async function uploadClickConversion(opts: {
  gclid: string;
  conversionActionId: string;
  at: Date;
  value?: number;
  currency?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!adsEnabled() || !opts.gclid || !opts.conversionActionId) return { ok: false };
  const c = creds();
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "no access token" };
    const conversion = buildClickConversion({
      gclid: opts.gclid,
      conversionActionId: opts.conversionActionId,
      customerId: c.customerId,
      conversionDateTime: formatAdsDateTime(opts.at),
      value: opts.value,
      currency: opts.currency,
    });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": c.developerToken,
      "Content-Type": "application/json",
    };
    if (c.loginCustomerId) headers["login-customer-id"] = c.loginCustomerId;
    const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${c.customerId}:uploadClickConversions`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ conversions: [conversion], partialFailure: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logError("Google Ads uploadClickConversions 失敗", new Error(`status ${res.status}`), { body: body.slice(0, 500) });
      return { ok: false, error: `status ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    logError("Google Ads uploadClickConversion 例外", e, { gclid: opts.gclid });
    return { ok: false, error: String(e) };
  }
}
