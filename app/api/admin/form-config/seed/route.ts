import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";
import { FORM_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";

// POST: デフォルト値でシード
// Body (optional): { schoolId: string | null }
// - schoolId == null or omitted -> seed global defaults (schoolId IS NULL)
// - schoolId == "xxx" -> seed school-specific from global defaults if school-specific is empty
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!checkAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    let schoolId: string | null = null;
    try {
      const body = await request.json();
      schoolId = body?.schoolId ?? null;
    } catch {
      // no body or invalid JSON - treat as global seed
    }

    // Check if configs already exist for this schoolId
    const existing = await prisma.formFieldConfig.count({
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
      const globalConfigs = await prisma.formFieldConfig.findMany({
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

    const created = await prisma.formFieldConfig.createMany({
      data: seedData.map(f => ({ id: crypto.randomUUID(), ...f, schoolId, updatedAt: new Date() })),
    });

    return NextResponse.json(
      { message: "シード完了", count: created.count, schoolId },
      { status: 201 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "シードに失敗しました" }, { status: 500 });
  }
}
