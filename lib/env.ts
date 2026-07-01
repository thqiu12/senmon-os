const isProd = process.env.NODE_ENV === "production";

function require_(name: string, minLen = 0): string {
  const v = process.env[name];
  if (!v || v.length < minLen) {
    if (isProd) {
      throw new Error(`Environment variable ${name} is required (min length ${minLen}).`);
    }
    console.warn(`[env] ${name} not set; using insecure dev fallback.`);
    return `dev-${name}-${Math.random().toString(36).slice(2)}`;
  }
  return v;
}

export const ENV = {
  isProd,
  SESSION_SECRET: require_("SESSION_SECRET", 32),
  CSRF_SECRET: process.env.CSRF_SECRET || require_("SESSION_SECRET", 32),
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  UPLOAD_DIR: process.env.UPLOAD_DIR || "private/uploads",
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || "10", 10),
  TRUSTED_PROXY_HEADER: process.env.TRUSTED_PROXY_HEADER || "x-real-ip",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  RESEND_FROM: process.env.RESEND_FROM || "",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
  PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || "",
  // AI書類照合(Haiku vision)。未設定なら AI 機能はUIに出ない・APIは無効。
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  // Google Ads オフラインコンバージョン送信。未設定(6点のいずれか欠け)なら送信は no-op。
  GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
  GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID || "",
  GOOGLE_ADS_CLIENT_SECRET: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
  GOOGLE_ADS_REFRESH_TOKEN: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
  GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID || "",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "",
  GOOGLE_ADS_CONV_APPLICATION: process.env.GOOGLE_ADS_CONV_APPLICATION || "",
  GOOGLE_ADS_CONV_OC: process.env.GOOGLE_ADS_CONV_OC || "",
} as const;
