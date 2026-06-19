// Sentry（ブラウザ側）。NEXT_PUBLIC_SENTRY_DSN 未設定なら no-op。
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  // セッションリプレイは既定オフ（コスト・プライバシー配慮、必要なら後で有効化）。
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
});
