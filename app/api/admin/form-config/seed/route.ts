import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";
import { FORM_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";

// POST: デフォルト値でシード
// Body (optional): { schoolId: string | null }
// - schoolId == null or omitted -> seed global defaults (schoolId IS NULL)
// - schoolId == "xxx" -> seed school-specific from global defaults if school-specific is empty
export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "出願フォームを編集する権限がありません" }, { status: 403 });
  }

  try {
    let schoolId: string | null = null;
    try {
      const body = await request.json();
      schoolId = body?.schoolId ?? null;
    } catch {
      // no body or invalid JSON - treat as global seed
    }

    const db = getTenantDb();
    // Check if configs already exist for this schoolId
    const existing = await db.formFieldConfig.count({
      where: { schoolId: schoolId },
    });

    if (existing > 0) {
      return NextResponse.json({
        message: "既にデータが存在します",
        count: existing,
        schoolId,
      });
    }

    let seedData: { fieldKey: string; label: string; section: string; fieldType: string; isRequired: boolean; displayOrder: number; isEnabled: boolean }[];

    if (schoolId === null) {
      // Seed global defaults from FORM_FIELD_DEFAULTS
      seedData = FORM_FIELD_DEFAULTS.map(f => ({
        fieldKey: f.fieldKey,
        label: f.label,
        section: f.section,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        isEnabled: true,
        displayOrder: f.displayOrder,
      }));
    } else {
      // Copy from global defaults (DB) if they exist, otherwise from FORM_FIELD_DEFAULTS
      const globalConfigs = await db.formFieldConfig.findMany({
        where: { schoolId: null },
        orderBy: { displayOrder: "asc" },
      });

      if (globalConfigs.length > 0) {
        seedData = globalConfigs.map(g => ({
          fieldKey: g.fieldKey,
          label: g.label,
          section: g.section,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fieldType: (g as any).fieldType ?? "text",
          isRequired: g.isRequired,
          isEnabled: g.isEnabled,
          displayOrder: g.displayOrder,
        }));
      } else {
        seedData = FORM_FIELD_DEFAULTS.map(f => ({
          fieldKey: f.fieldKey,
          label: f.label,
          section: f.section,
          fieldType: f.fieldType,
          isRequired: f.isRequired,
          isEnabled: true,
          displayOrder: f.displayOrder,
        }));
      }
    }

    const created = await db.formFieldConfig.createMany({
      data: seedData.map(f => ({ id: require("crypto").randomUUID(), ...f, schoolId, updatedAt: new Date() })),
    });

    return NextResponse.json(
      { message: "シード完了", count: created.count, schoolId },
      { status: 201 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "シードに失敗しました" }, { status: 500 });
  }
});
