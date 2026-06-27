/**
 * Plan 2 Phase B — 既存データを 1 つの Organization「知日グループ」に紐付ける backfill。
 *
 * 使い方(本番では Phase A デプロイ後・Phase C デプロイ前に一度だけ):
 *   npx tsx prisma/backfill-organization.ts
 *
 * 方針:
 *  - slug="chinichi" の Organization を upsert(冪等)。
 *  - 全テナント対象モデルの organizationId IS NULL の行だけを当該 org に更新(冪等・再実行可)。
 *  - 既に非 null の行は触らない(複数回流しても安全)。
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = process.env.ORG_SLUG || "chinichi";
const NAME = process.env.ORG_NAME || "知日グループ";

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: NAME, slug: SLUG },
  });
  console.log(`Organization: ${NAME} (slug=${SLUG}, id=${org.id})\n`);

  let total = 0;
  for (const m of Prisma.dmmf.datamodel.models) {
    if (m.name === "Organization") continue;
    const delegate = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    const r = await (prisma as any)[delegate].updateMany({
      where: { organizationId: null },
      data: { organizationId: org.id },
    });
    total += r.count;
    console.log(`${m.name.padEnd(22)} ${String(r.count).padStart(6)}`);
  }
  console.log(`\n✓ backfill 完了: ${total} 行を org=${org.id} に紐付け`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
