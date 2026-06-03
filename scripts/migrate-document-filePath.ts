/**
 * 既存 Document.filePath を新しいダウンロードURL形式に移行する一発スクリプト。
 *
 * 背景:
 *   旧コードは filePath="/uploads/${applicationId}/${fileName}" を保存していたが、
 *   UPLOAD_DIR を public/ の外に置いた現状では直接アクセスで 404 になる。
 *   新規アップロードは "/api/documents/${id}/file" を保存するようになったため、
 *   既存レコードもこの形式に合わせる。
 *
 * 実行:
 *   DATABASE_URL="file:./prisma/data.db" npx tsx scripts/migrate-document-filePath.ts
 *
 * 冪等:
 *   既に /api/documents/ で始まる行はスキップ。何度流しても安全。
 */
import { prisma } from "../lib/prisma";

async function main() {
  const docs = await prisma.document.findMany({
    where: {
      NOT: { filePath: { startsWith: "/api/documents/" } },
    },
    select: { id: true, filePath: true },
  });

  if (docs.length === 0) {
    console.log("✓ migration not needed — 0 rows");
    return;
  }

  console.log(`migrating ${docs.length} document(s)…`);
  let n = 0;
  for (const d of docs) {
    await prisma.document.update({
      where: { id: d.id },
      data: { filePath: `/api/documents/${d.id}/file` },
    });
    n++;
    if (n % 50 === 0) console.log(`  ${n}/${docs.length}`);
  }
  console.log(`✓ migrated ${n} document(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
