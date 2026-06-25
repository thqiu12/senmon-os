/**
 * 「全校共通」スコープ廃止のための一回限り移行スクリプト。
 *
 * 背景:
 *   FormFieldConfig.schoolId=null（全校共通）と SystemSetting(payment_config) の
 *   "__global__" を廃止する。各校（ApplySchool.schoolKey）に設定を実体としてコピーしてから、
 *   共通スコープを削除する。FormFieldConfig.schoolId には schoolKey 文字列が入る
 *   （cuid ではない。app/api/apply/form-config 等が schoolKey で where している）。
 *
 * 実行:
 *   DATABASE_URL="<postgres>" npx tsx scripts/migrate-remove-common.ts
 *
 * 冪等:
 *   - 各校への FormFieldConfig コピーは createMany + skipDuplicates、
 *     かつ rowsToCopyForSchool で既存 (fieldKey, applicantType) はスキップ。
 *   - グローバル行削除後の再実行: global 行 0 件 → コピー 0 件、deleteMany 0 件 → no-op。
 *   - Payment は __global__ が無ければ展開せず削除のみ（既に消えていれば no-op）。
 *   何度流しても安全。学校別の上書き設定は温存される。
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { rowsToCopyForSchool, expandGlobalPayment } from "../lib/migrateRemoveCommon";
import { PAYMENT_CONFIG_KEY, GLOBAL_KEY, parsePaymentMap, sanitizeMap } from "../lib/paymentConfig";

const prisma = new PrismaClient();

async function main() {
  // 1) 全 ApplySchool の schoolKey
  const schools = await prisma.applySchool.findMany({ select: { schoolKey: true } });
  const schoolKeys = schools.map((s) => s.schoolKey);
  console.log(`schools: ${schoolKeys.length} (${schoolKeys.join(", ") || "-"})`);

  // 2) FormFieldConfig: グローバル行を各校へコピー
  const globalRows = await prisma.formFieldConfig.findMany({ where: { schoolId: null } });
  console.log(`global FormFieldConfig rows: ${globalRows.length}`);

  let copied = 0;
  for (const schoolKey of schoolKeys) {
    const schoolRows = await prisma.formFieldConfig.findMany({
      where: { schoolId: schoolKey },
      select: { fieldKey: true, applicantType: true },
    });
    const toCopy = rowsToCopyForSchool(globalRows, schoolRows);
    if (toCopy.length === 0) {
      console.log(`  ${schoolKey}: +0 (already complete)`);
      continue;
    }
    const result = await prisma.formFieldConfig.createMany({
      data: toCopy.map((g) => ({
        id: randomUUID(),
        fieldKey: g.fieldKey,
        schoolId: schoolKey,
        label: g.label,
        section: g.section,
        fieldType: g.fieldType,
        isEnabled: g.isEnabled,
        isRequired: g.isRequired,
        displayOrder: g.displayOrder,
        description: g.description,
        options: g.options,
        applicantType: g.applicantType,
        updatedAt: new Date(),
      })),
      skipDuplicates: true,
    });
    copied += result.count;
    console.log(`  ${schoolKey}: +${result.count}`);
  }
  console.log(`FormFieldConfig copied total: ${copied}`);

  // 3) Payment: __global__ を各校へ展開し __global__ を削除
  const setting = await prisma.systemSetting.findUnique({ where: { key: PAYMENT_CONFIG_KEY } });
  const map = parsePaymentMap(setting?.value);
  const hadGlobal = GLOBAL_KEY in map;
  const expanded = expandGlobalPayment(map, schoolKeys, GLOBAL_KEY);
  const cleaned = sanitizeMap(expanded);
  await prisma.systemSetting.upsert({
    where: { key: PAYMENT_CONFIG_KEY },
    update: { value: JSON.stringify(cleaned) },
    create: { key: PAYMENT_CONFIG_KEY, value: JSON.stringify(cleaned) },
  });
  console.log(
    `payment: __global__ ${hadGlobal ? "expanded & removed" : "absent (no-op)"}; ` +
      `schools in map: ${Object.keys(cleaned).length}`
  );

  // 4) コピー成功後にグローバル FormFieldConfig 行を削除
  const del = await prisma.formFieldConfig.deleteMany({ where: { schoolId: null } });
  console.log(`global FormFieldConfig rows deleted: ${del.count}`);

  console.log("✓ migrate-remove-common done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
