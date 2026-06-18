import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FORM_FIELD_DEFAULTS, defaultEnabledFor } from "@/lib/formFieldDefaults";
import { isApplicantType, type ApplicantType } from "@/lib/applicantType";
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
} as const;

// マージ計算に必要な分類用フィールドを含む行の型。
// schoolId / applicantType は分類専用で、最終出力からは除外する。
type ConfigRow = {
  fieldKey: string;
  label: string;
  fieldType: string;
  isEnabled: boolean;
  isRequired: boolean;
  displayOrder: number | null;
  section: string;
  description: string | null;
  schoolId: string | null;
  applicantType: string | null;
};

type OutputConfig = {
  fieldKey: string;
  label: string;
  fieldType: string;
  isEnabled: boolean;
  isRequired: boolean;
  displayOrder: number | null;
  section: string;
  description: string | null;
};

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
  }));
}

/**
 * 純関数: 既定 + DB 行を出願者タイプに沿ってマージする（DB 非依存）。
 *
 * 優先順位（後勝ち、高いほど優先）:
 *   既定(type別) < 全校共通(null) < 全校(type) < 学校共通(null) < 学校(type)
 *
 * rows は schoolId / applicantType を含む DB 行。schoolId が非 null なら学校行、
 * null なら全校行として分類する。applicantType が null なら共通、type 一致なら type 行。
 * 該当 type 以外の applicantType を持つ行は無視する。
 * 最終的に isEnabled の行のみを displayOrder 昇順で返す。
 */
export function mergeFormConfig(
  defaults: typeof FORM_FIELD_DEFAULTS,
  rows: ConfigRow[],
  type: ApplicantType
): OutputConfig[] {
  // tier: 大きいほど優先（後勝ち）
  const tierOf = (r: ConfigRow): number | null => {
    const typeMatch = r.applicantType === null ? "common" : r.applicantType === type ? "type" : null;
    if (typeMatch === null) return null; // 別タイプの行は無視
    const isSchool = r.schoolId !== null;
    if (!isSchool && typeMatch === "common") return 1; // 全校共通
    if (!isSchool && typeMatch === "type") return 2; // 全校 type
    if (isSchool && typeMatch === "common") return 3; // 学校共通
    return 4; // 学校 type
  };

  const map = new Map<string, OutputConfig>();

  // tier 0: 既定（type 別 isEnabled）
  for (const f of defaults) {
    map.set(f.fieldKey, {
      fieldKey: f.fieldKey,
      label: f.label,
      fieldType: f.fieldType,
      isEnabled: defaultEnabledFor(f.fieldKey, type),
      isRequired: f.isRequired,
      displayOrder: f.displayOrder,
      section: f.section,
      description: null,
    });
  }

  // DB 行を tier 昇順に適用（同 tier は入力順）。後勝ちで上書き。
  // ascending tier => later writes always win; no per-key guard needed.
  const candidates = rows
    .map((r) => ({ r, tier: tierOf(r) }))
    .filter((x): x is { r: ConfigRow; tier: number } => x.tier !== null)
    .sort((a, b) => a.tier - b.tier);

  for (const { r } of candidates) {
    map.set(r.fieldKey, {
      fieldKey: r.fieldKey,
      label: r.label,
      fieldType: r.fieldType,
      isEnabled: r.isEnabled,
      isRequired: r.isRequired,
      displayOrder: r.displayOrder,
      section: r.section,
      description: r.description,
    });
  }

  return Array.from(map.values())
    .filter((c) => c.isEnabled)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") || null;
    const typeParam = searchParams.get("type");

    // type 指定あり・有効: タイプ対応マージ
    if (isApplicantType(typeParam)) {
      const type = typeParam;
      // 全校共通/全校type/学校共通/学校type の候補をすべて取得。
      // isEnabled は merge 後に最終フィルタするためここでは絞らない。
      const rows = await prisma.formFieldConfig.findMany({
        where: {
          AND: [
            { OR: [{ schoolId: null }, ...(schoolId ? [{ schoolId }] : [])] },
            { OR: [{ applicantType: null }, { applicantType: type }] },
          ],
        },
        orderBy: { displayOrder: "asc" },
        select: SELECT_WITH_CLASS,
      });
      const merged = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, type);
      return NextResponse.json(merged);
    }

    // type 未指定/無効: 従来挙動（共通のみ）。
    // applicantType:null で絞り、type別行(admin が後から作成し得る)を共通結果に混入させない。
    const [globalConfigs, schoolConfigs] = await Promise.all([
      prisma.formFieldConfig.findMany({
        where: { schoolId: null, applicantType: null, isEnabled: true },
        orderBy: { displayOrder: "asc" },
        select: SELECT,
      }),
      schoolId
        ? prisma.formFieldConfig.findMany({
            where: { schoolId, applicantType: null },
            orderBy: { displayOrder: "asc" },
            select: SELECT,
          })
        : Promise.resolve([]),
    ]);

    if (!schoolId) {
      return NextResponse.json(globalConfigs.length > 0 ? globalConfigs : fallback());
    }

    if (schoolConfigs.length === 0) {
      return NextResponse.json(globalConfigs.length > 0 ? globalConfigs : fallback());
    }

    const globalMap = new Map(globalConfigs.map((c) => [c.fieldKey, c]));
    const schoolMap = new Map(schoolConfigs.map((c) => [c.fieldKey, c]));
    const allKeys = new Set([
      ...FORM_FIELD_DEFAULTS.map((f) => f.fieldKey),
      ...Array.from(globalMap.keys()),
      ...Array.from(schoolMap.keys()),
    ]);

    const merged = Array.from(allKeys)
      .map((key) => {
        const s = schoolMap.get(key);
        if (s) return s;
        const g = globalMap.get(key);
        if (g) return g;
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
