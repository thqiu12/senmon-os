import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FORM_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";

export const dynamic = "force-dynamic";

// GET: 有効なフォームフィールド設定一覧（認証不要・公開）
// Query param: ?schoolId=xxx (optional)
// If schoolId provided: return school-specific merged with global (school overrides global)
// If no schoolId: return global defaults
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") || null;

    // Fetch global configs
    const globalConfigs = await prisma.formFieldConfig.findMany({
      where: { schoolId: null, isEnabled: true },
      orderBy: { displayOrder: "asc" },
      select: {
        fieldKey: true,
        label: true,
        fieldType: true,
        isEnabled: true,
        isRequired: true,
        displayOrder: true,
        section: true,
        description: true,
      },
    });

    if (!schoolId) {
      // Return global configs (fallback to hardcoded defaults if DB is empty)
      if (globalConfigs.length > 0) {
        return NextResponse.json(globalConfigs);
      }
      // Fallback to hardcoded defaults
      const fallback = FORM_FIELD_DEFAULTS.map(f => ({
        fieldKey: f.fieldKey,
        label: f.label,
        fieldType: f.fieldType,
        isEnabled: true,
        isRequired: f.isRequired,
        displayOrder: f.displayOrder,
        section: f.section,
        description: null,
      }));
      return NextResponse.json(fallback);
    }

    // Fetch school-specific overrides (enabled only for public API)
    const schoolConfigs = await prisma.formFieldConfig.findMany({
      where: { schoolId },
      orderBy: { displayOrder: "asc" },
      select: {
        fieldKey: true,
        label: true,
        fieldType: true,
        isEnabled: true,
        isRequired: true,
        displayOrder: true,
        section: true,
        description: true,
      },
    });

    // If no school-specific config exists, return global
    if (schoolConfigs.length === 0) {
      if (globalConfigs.length > 0) {
        return NextResponse.json(globalConfigs);
      }
      const fallback = FORM_FIELD_DEFAULTS.map(f => ({
        fieldKey: f.fieldKey,
        label: f.label,
        fieldType: f.fieldType,
        isEnabled: true,
        isRequired: f.isRequired,
        displayOrder: f.displayOrder,
        section: f.section,
        description: null,
      }));
      return NextResponse.json(fallback);
    }

    // Build merged result: school overrides global
    const globalMap = new Map(globalConfigs.map(c => [c.fieldKey, c]));
    const schoolMap = new Map(schoolConfigs.map(c => [c.fieldKey, c]));

    // Collect all fieldKeys from global + school-specific (school may have extra fields)
    const allFieldKeys = new Set([
      ...FORM_FIELD_DEFAULTS.map(f => f.fieldKey),
      ...Array.from(globalMap.keys()),
      ...Array.from(schoolMap.keys()),
    ]);

    const merged = Array.from(allFieldKeys).map(fieldKey => {
      const schoolOverride = schoolMap.get(fieldKey);
      if (schoolOverride) return schoolOverride;
      const globalDefault = globalMap.get(fieldKey);
      if (globalDefault) return globalDefault;
      const def = FORM_FIELD_DEFAULTS.find(f => f.fieldKey === fieldKey);
      if (def) {
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
      }
      return null;
    }).filter(Boolean).filter(c => c!.isEnabled);

    merged.sort((a, b) => (a!.displayOrder ?? 0) - (b!.displayOrder ?? 0));

    return NextResponse.json(merged);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
