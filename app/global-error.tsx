"use client";

// App Router のルートエラーバウンダリ。React レンダリングエラーを Sentry に報告する
// （DSN 未設定なら captureException は no-op）。最小限のフォールバック UI を表示。
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ fontFamily: "sans-serif", padding: "40px", textAlign: "center", color: "#1e3a5f" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>エラーが発生しました</h2>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          申し訳ありません。問題が発生しました。お手数ですが再読み込みをお試しください。
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
        >
          再読み込み
        </button>
      </body>
    </html>
  );
}
