/**
 * 既存アップロード書類の移行スクリプト。
 *
 * 旧: public/uploads/<applicationId>/<fileName> （誰でもアクセス可能な静的配信）
 *     DBの filePath = "/uploads/<applicationId>/<fileName>"
 * 新: <STORAGE_ROOT>/<applicationId>/<fileName>   （public/ の外）
 *     DBの filePath = "/api/documents/<documentId>/file" （認証付き配信）
 *
 * 実行:  npx ts-node scripts/migrate-uploads.ts
 *        （DRY_RUN=1 を付けると変更せず内容だけ表示）
 */
import { PrismaClient } from "@prisma/client";
import path from "path";
import { mkdir, rename, access } from "fs/promises";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "1";

const STORAGE_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "storage", "uploads");

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  const docs = await prisma.document.findMany({
    where: { filePath: { startsWith: "/uploads/" } },
  });
  console.log(`対象書類: ${docs.length}件 (DRY_RUN=${DRY_RUN ? "ON" : "OFF"})`);

  // 旧パス → 新ダウンロードURL の対応表（LeaveRequest.proofFilePath の更新用）
  const remap = new Map<string, string>();
  let moved = 0;
  let missingFile = 0;

  for (const doc of docs) {
    const oldPhysical = path.join(process.cwd(), "public", "uploads", doc.applicationId, doc.fileName);
    const newDir = path.join(STORAGE_ROOT, doc.applicationId);
    const newPhysical = path.join(newDir, doc.fileName);
    const newUrl = `/api/documents/${doc.id}/file`;
    remap.set(doc.filePath, newUrl);

    if (DRY_RUN) {
      console.log(`  [dry] ${doc.filePath} -> ${newUrl}`);
      continue;
    }

    // 物理ファイルを移動（旧ファイルが無くてもDBは更新する）
    if (await exists(oldPhysical)) {
      await mkdir(newDir, { recursive: true });
      if (!(await exists(newPhysical))) {
        await rename(oldPhysical, newPhysical);
      }
      moved++;
    } else {
      missingFile++;
    }

    await prisma.document.update({
      where: { id: doc.id },
      data: { filePath: newUrl },
    });
  }

  // LeaveRequest.proofFilePath を新URLに更新
  const leaves = await prisma.leaveRequest.findMany({
    where: { proofFilePath: { startsWith: "/uploads/" } },
  });
  let leavesUpdated = 0;
  for (const lr of leaves) {
    const newUrl = lr.proofFilePath ? remap.get(lr.proofFilePath) : undefined;
    if (!newUrl) continue;
    if (DRY_RUN) {
      console.log(`  [dry] leave ${lr.id}: ${lr.proofFilePath} -> ${newUrl}`);
      continue;
    }
    await prisma.leaveRequest.update({ where: { id: lr.id }, data: { proofFilePath: newUrl } });
    leavesUpdated++;
  }

  console.log(`完了: ファイル移動=${moved}, 物理ファイル欠落=${missingFile}, LeaveRequest更新=${leavesUpdated}`);
  console.log(`移行後は public/uploads/ を削除してください（公開配信を停止するため）。`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
