/**
 * 「共通(applicantType=null)」スコープ廃止のための一回限り移行スクリプト。
 *
 * 背景:
 *   FormFieldConfig.applicantType=null（共通）を廃止する。共通行は現状
 *   japanese / foreign の両タイプに適用されているため、挙動を保つには各タイプへ
 *   実体としてコピーしてから共通行を削除する。FormFieldConfig には
 *   @@unique([fieldKey, schoolId, applicantType]) があり、schoolId には schoolKey
 *   文字列が入る（cuid ではない）。
 *
 * 実行:
 *   DATABASE_URL="<postgres>" npx tsx scripts/migrate-remove-common-type.ts
 *
 * 冪等:
 *   - 各タイプへの FormFieldConfig コピーは createMany + skipDuplicates、
 *     かつ nullRowsToCopyForType で既存タイプ行（同 fieldKey）はスキップ。
 *   - 削除はコピー成功後（全校分のコピー完了後）に applicantType=null を deleteMany。
 *   - 再実行時: null 行 0 件 → コピー 0 件、deleteMany 0 件 → no-op。
 *   何度流しても安全。タイプ別の上書き設定は温存される。
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { nullRowsToCopyForType } from "../lib/migrateRemoveCommonType";

const prisma = new PrismaClient();

const TARGET_TYPES = ["japanese", "foreign"] as const;

async function main() {
  // 1) 全 ApplySchool の schoolKey
  const schools = await prisma.applySchool.findMany({ select: { schoolKey: true } });
  const schoolKeys = schools.map((s) => s.schoolKey);
  console.log(`schools: ${schoolKeys.length} (${schoolKeys.join(", ") || "-"})`);

  // 2) 各校 × 各タイプへ共通(null)行をコピー
  let totalCopied = 0;
  for (const schoolKey of schoolKeys) {
    const nullRows = await prisma.formFieldConfig.findMany({
      where: { schoolId: schoolKey, applicantType: null },
    });
    if (nullRows.length === 0) {
      console.log(`  ${schoolKey}: common rows 0 (nothing to copy)`);
      continue;
    }

    let schoolCopied = 0;
    for (const type of TARGET_TYPES) {
      const typeRows = await prisma.formFieldConfig.findMany({
        where: { schoolId: schoolKey, applicantType: type },
        select: { fieldKey: true },
      });
      const toCopy = nullRowsToCopyForType(nullRows, typeRows);
      if (toCopy.length === 0) {
        console.log(`  ${schoolKey}/${type}: +0 (already complete)`);
        continue;
      }
      const result = await prisma.formFieldConfig.createMany({
        data: toCopy.map((r) => ({
          id: randomUUID(),
          fieldKey: r.fieldKey,
          schoolId: schoolKey,
          label: r.label,
          section: r.section,
          fieldType: r.fieldType,
          isEnabled: r.isEnabled,
          isRequired: r.isRequired,
          displayOrder: r.displayOrder,
          description: r.description,
          options: r.options,
          showWhenExamMode: r.showWhenExamMode,
          applicantType: type,
          updatedAt: new Date(),
        })),
        skipDuplicates: true,
      });
      schoolCopied += result.count;
      console.log(`  ${schoolKey}/${type}: +${result.count}`);
    }
    totalCopied += schoolCopied;
  }
  console.log(`FormFieldConfig copied total: ${totalCopied}`);

  // 3) コピー成功後に共通(null)行を削除
  const del = await prisma.formFieldConfig.deleteMany({ where: { applicantType: null } });
  console.log(`common (applicantType=null) FormFieldConfig rows deleted: ${del.count}`);

  console.log("✓ migrate-remove-common-type done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
