import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * デプロイメタ情報を返す。
 * - ヘルスチェック後の SHA 検証
 * - デバッグ・運用監視
 * - 認証不要（バージョン情報のみ、機密なし）
 */
export const dynamic = "force-dynamic";

interface DeployMeta {
  deployedAt?: string;
  sha?: string;
  shortSha?: string;
  branch?: string;
  deployedBy?: string;
  buildId?: string;
  rolledBackFrom?: string;
  uptime: number;
  serverTime: string;
}

export async function GET() {
  const metaPath = path.join(process.cwd(), ".deploy-meta.json");
  let meta: Partial<DeployMeta> = {};

  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf-8")) as Partial<DeployMeta>;
    } catch {
      /* metadata 壊れてても 200 で空 meta 返す */
    }
  }

  return NextResponse.json(
    {
      ...meta,
      uptime: process.uptime(),
      serverTime: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
