/** @type {import('next').NextConfig} */

// セキュリティヘッダ（全レスポンス共通）
const securityHeaders = [
  // クリックジャッキング対策（管理画面をiframe埋め込みさせない）
  { key: "X-Frame-Options", value: "DENY" },
  // MIMEスニッフィング無効化
  { key: "X-Content-Type-Options", value: "nosniff" },
  // リファラ漏えい抑制
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 不要なブラウザ機能を無効化
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HTTPS強制（HTTPS配信が前提。1年・サブドメイン含む）
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // 最小限のCSP（インラインは Next の都合で許可。必要に応じて nonce 化を検討）
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://api.resend.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "puppeteer-core"],
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        // 動的ページ/APIはキャッシュさせない
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          ...securityHeaders,
        ],
      },
      {
        // 静的アセットは長期キャッシュ（パフォーマンス）
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
