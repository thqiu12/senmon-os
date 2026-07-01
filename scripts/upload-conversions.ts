/**
 * Google Ads オフラインコンバージョン backfill。
 * 既存の gclid 付き Application / OCReservation を送信する（一回限り・冪等寄り）。
 * 使い方:
 *   DATABASE_URL=... GOOGLE_ADS_...（認証6点+アクションID） \
 *   npx tsx scripts/upload-conversions.ts --type=all --from=2026-06-01
 * 認証情報が未設定なら 0 件で終了。
 */
import { PrismaClient } from "@prisma/client";
import { adsEnabled, uploadClickConversion } from "@/lib/googleAds";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  if (!adsEnabled()) {
    console.warn("[backfill] Google Ads 認証情報が未設定です。0 件で終了します。");
    return;
  }
  const type = (arg("type") || "all").toLowerCase();
  const fromStr = arg("from");
  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (isNaN(from.getTime())) {
    console.error(`[backfill] --from の日付が不正: ${fromStr}`);
    process.exit(1);
  }
  const convApp = process.env.GOOGLE_ADS_CONV_APPLICATION || "";
  const convOc = process.env.GOOGLE_ADS_CONV_OC || "";
  const prisma = new PrismaClient();
  let sent = 0, skipped = 0, failed = 0;

  try {
    if ((type === "all" || type === "application") && convApp) {
      const apps = await prisma.application.findMany({
        where: { gclid: { not: null }, createdAt: { gte: from } },
        select: { id: true, gclid: true, createdAt: true },
      });
      console.log(`[backfill] 出願 ${apps.length} 件（gclid 付き, from=${from.toISOString().slice(0, 10)}）`);
      for (const a of apps) {
        if (!a.gclid) { skipped++; continue; }
        const r = await uploadClickConversion({ gclid: a.gclid, conversionActionId: convApp, at: a.createdAt });
        if (r.ok) sent++; else failed++;
      }
    } else if (type === "all" || type === "application") {
      console.warn("[backfill] GOOGLE_ADS_CONV_APPLICATION 未設定 → 出願はスキップ");
    }

    if ((type === "all" || type === "oc") && convOc) {
      const rs = await prisma.oCReservation.findMany({
        where: { gclid: { not: null }, createdAt: { gte: from } },
        select: { id: true, gclid: true, createdAt: true },
      });
      console.log(`[backfill] OC予約 ${rs.length} 件（gclid 付き）`);
      for (const r0 of rs) {
        if (!r0.gclid) { skipped++; continue; }
        const r = await uploadClickConversion({ gclid: r0.gclid, conversionActionId: convOc, at: r0.createdAt });
        if (r.ok) sent++; else failed++;
      }
    } else if (type === "all" || type === "oc") {
      console.warn("[backfill] GOOGLE_ADS_CONV_OC 未設定 → OC予約はスキップ");
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`[backfill] 完了: 送信=${sent} 失敗=${failed} スキップ=${skipped}`);
}

main().catch((e) => {
  console.error("[backfill] 予期せぬエラー:", e);
  process.exit(1);
});
