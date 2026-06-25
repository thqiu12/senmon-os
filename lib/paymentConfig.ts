// 支払い設定（受験料・学費の振込先＋QR）を学校別に保持する共通ロジック。
// SystemSetting(key="payment_config") に { [schoolKey]: PaymentConfig } のマップとして保存。
// 支払い設定は学校別（schoolKey ごと）のみで解決する。全校共通フォールバックは廃止。
// （"__global__" キーは旧フラット形式の移行先として parsePaymentMap で互換のため残置）
// QR は data URI（base64）で保持（画像配信不要・デプロイ安全）。

export interface PayMethod {
  bankInfo: string;
  qr: string | null;
}
export interface PaymentConfig {
  examFee: PayMethod;
  tuition: PayMethod;
}

export const PAYMENT_CONFIG_KEY = "payment_config";
export const GLOBAL_KEY = "__global__";
export const MAX_QR_LEN = 800_000; // data URI 約600KB相当

export function emptyMethod(): PayMethod {
  return { bankInfo: "", qr: null };
}
export function emptyConfig(): PaymentConfig {
  return { examFee: emptyMethod(), tuition: emptyMethod() };
}

function sanitizeQr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!v.startsWith("data:image/")) return null; // data URI 画像のみ
  if (v.length > MAX_QR_LEN) return null;
  return v;
}
export function sanitizeMethod(m: unknown): PayMethod {
  const o = (m ?? {}) as Record<string, unknown>;
  return { bankInfo: String(o.bankInfo ?? "").slice(0, 2000), qr: sanitizeQr(o.qr) };
}
export function sanitizeConfig(c: unknown): PaymentConfig {
  const o = (c ?? {}) as Record<string, unknown>;
  return { examFee: sanitizeMethod(o.examFee), tuition: sanitizeMethod(o.tuition) };
}

/** 保存値（旧フラット形式 { examFee, tuition } も許容）→ 学校別マップ */
export function parsePaymentMap(raw: string | null | undefined): Record<string, PaymentConfig> {
  if (!raw) return {};
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return {}; }
  if (!o || typeof o !== "object") return {};
  const obj = o as Record<string, unknown>;
  // 旧フラット形式（全体共通1件）→ __global__ に移行
  if ((obj.examFee || obj.tuition) && !obj[GLOBAL_KEY]) {
    return { [GLOBAL_KEY]: sanitizeConfig(obj) };
  }
  const map: Record<string, PaymentConfig> = {};
  for (const [k, v] of Object.entries(obj)) map[k] = sanitizeConfig(v);
  return map;
}

/** 学校別マップを丸ごとサニタイズ（保存前） */
export function sanitizeMap(o: unknown): Record<string, PaymentConfig> {
  if (!o || typeof o !== "object") return {};
  const map: Record<string, PaymentConfig> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    map[String(k).slice(0, 64)] = sanitizeConfig(v);
  }
  return map;
}

/** 学校別の設定のみを解決（全校共通フォールバックなし） */
export function resolvePayment(
  map: Record<string, PaymentConfig>,
  schoolKey?: string | null
): PaymentConfig {
  return (schoolKey && map[schoolKey]) || emptyConfig();
}
