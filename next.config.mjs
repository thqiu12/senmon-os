/** @type {import('next').NextConfig} */
const securityHeaders = [
  // SAMEORIGIN: 自サイト内（書類プレビューの iframe 等）は許可しつつ、
  // 他サイトからのフレーム埋め込み（クリックジャッキング）は引き続き拒否。
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig = {
  // ビルド出力先。デプロイ時は NEXT_DIST_DIR=.next.build で別ディレクトリにビルドし、
  // 完成後に .next へ原子的に差し替える（ビルド中もサイトを落とさないため）。
  // 通常実行（pm2 next start）では env 未設定なので既定の .next を読む。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "puppeteer-core", "bcrypt"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // HTMLページのみ no-store。静的アセットはキャッシュ可能。
        source: "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
