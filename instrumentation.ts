// Next.js instrumentation。サーバー/Edge 起動時に Sentry を初期化する。
// （DSN 未設定時は各 config 内の enabled:false で no-op）
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
