import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FORM_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";
import { isApplicantType } from "@/lib/applicantType";
import { mergeFormConfig } from "@/lib/applyFormConfigMerge";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

const SELECT = {
  fieldKey: true,
  label: true,
  fieldType: true,
  isEnabled: true,
  isRequired: true,
  displayOrder: true,
  section: true,
  description: true,
  options: true,
  showWhenExamMode: true,
} as const;

const SELECT_WITH_CLASS = {
  ...SELECT,
  schoolId: true,
  applicantType: true,
} as const;

function fallback() {
  return FORM_FIELD_DEFAULTS.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    fieldType: f.fieldType,
    isEnabled: true,
    isRequired: f.isRequired,
    displayOrder: f.displayOrder,
    section: f.section,
    description: null,
    options: null,
    showWhenExamMode: null,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") || null;
    const typeParam = searchParams.get("type");

    // type 指定あり・有効: タイプ対応マージ（学校×当該type のみ。全校共通・共通タイプは廃止）
    if (isApplicantType(typeParam)) {
      const type = typeParam;
      // 選択中の学校・当該タイプの行のみ取得。schoolId 無指定なら 0 行 → mergeFormConfig が既定で補完。
      // isEnabled は merge 後に最終フィルタするためここでは絞らない。
      const rows = await prisma.formFieldConfig.findMany({
        where: {
          AND: [
            schoolId ? { schoolId } : { schoolId: "__none__" },
            { applicantType: type },
          ],
        },
        orderBy: { displayOrder: "asc" },
        select: SELECT_WITH_CLASS,
      });
      const merged = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, type);
      return NextResponse.json(merged);
    }

    // type 未指定/無効: 従来挙動（共通のみ）。全校共通は廃止＝学校行 + 既定のみ。
    // schoolId 無指定なら既定を返す。
    if (!schoolId) {
      return NextResponse.json(fallback());
    }

    // applicantType:null で絞り、type別行(admin が後から作成し得る)を共通結果に混入させない。
    const schoolConfigs = await prisma.formFieldConfig.findMany({
      where: { schoolId, applicantType: null },
      orderBy: { displayOrder: "asc" },
      select: SELECT,
    });

    if (schoolConfigs.length === 0) {
      return NextResponse.json(fallback());
    }

    const schoolMap = new Map(schoolConfigs.map((c) => [c.fieldKey, c]));
    const allKeys = new Set([
      ...FORM_FIELD_DEFAULTS.map((f) => f.fieldKey),
      ...Array.from(schoolMap.keys()),
    ]);

    const merged = Array.from(allKeys)
      .map((key) => {
        const s = schoolMap.get(key);
        if (s) return s;
        const def = FORM_FIELD_DEFAULTS.find((f) => f.fieldKey === key);
        if (!def) return null;
        return {
          fieldKey: def.fieldKey,
          label: def.label,
          fieldType: def.fieldType,
          isEnabled: true,
          isRequired: def.isRequired,
          displayOrder: def.displayOrder,
          section: def.section,
          description: null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.isEnabled)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    return NextResponse.json(merged);
  } catch (e) {
    logError("GET /api/apply/form-config", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
