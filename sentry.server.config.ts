// Sentry（サーバー側）。SENTRY_DSN 未設定なら enabled:false で完全 no-op（無害）。
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  // エラー収集が主目的。パフォーマンストレースは既定オフ（コスト抑制、必要なら後で上げる）。
  tracesSampleRate: 0,
  // 在留情報・メール等の PII を自動送信しない。
  sendDefaultPii: false,
});
