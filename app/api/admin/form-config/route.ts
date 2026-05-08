import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";
import { FORM_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";

// schoolId=xxx -> school-specific merged with global
// schoolId not provided -> global only
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!checkAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") || null;

    // Always fetch global configs (schoolId IS NULL)
    const globalConfigs = await prisma.formFieldConfig.findMany({
      where: { schoolId: null },
      orderBy: { displayOrder: "asc" },
    });

    if (!schoolId) {
      // Return global configs only
      return NextResponse.json(globalConfigs);
    }

    // Fetch school-specific overrides
    const schoolConfigs = await prisma.formFieldConfig.findMany({
      where: { schoolId },
      orderBy: { displayOrder: "asc" },
    });

    // Merge: start from global defaults, overlay school-specific overrides
    // Build a map of fieldKey -> global config
    const globalMap = new Map(globalConfigs.map(c => [c.fieldKey, c]));
    const schoolMap = new Map(schoolConfigs.map(c => [c.fieldKey, c]));

    // Also include any fields defined only in defaults (not yet in DB)
    const allFieldKeys = new Set([
      ...FORM_FIELD_DEFAULTS.map(f => f.fieldKey),
      ...Array.from(globalMap.keys()),
      ...Array.from(schoolMap.keys()),
    ]);

    const merged = Array.from(allFieldKeys).map(fieldKey => {
      const schoolOverride = schoolMap.get(fieldKey);
      const globalDefault = globalMap.get(fieldKey);
      if (schoolOverride) {
        return { ...schoolOverride, isCustom: true };
      }
      if (globalDefault) {
        return { ...globalDefault, isCustom: false };
      }
      // fallback to FORM_FIELD_DEFAULTS
      const def = FORM_FIELD_DEFAULTS.find(f => f.fieldKey === fieldKey);
      if (def) {
        return {
          id: "",
          fieldKey: def.fieldKey,
          schoolId: null,
          label: def.label,
          section: def.section,
          fieldType: def.fieldType,
          isEnabled: true,
          isRequired: def.isRequired,
          displayOrder: def.displayOrder,
          isCustom: false,
        };
      }
      return null;
    }).filter(Boolean);

    merged.sort((a, b) => (a!.displayOrder ?? 0) - (b!.displayOrder ?? 0));

    return NextResponse.json(merged);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: create a new field config
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!checkAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      label,
      section,
      fieldType = "text",
      isEnabled = true,
      isRequired = false,
      displayOrder = 999,
      schoolId = null,
      description = null,
    } = body;

    if (!label) {
      return NextResponse.json({ error: "ラベルは必須です" }, { status: 400 });
    }

    // Auto-generate fieldKey from label if not provided
    const fieldKey = body.fieldKey || `custom_${Date.now()}`;

    const created = await prisma.formFieldConfig.create({
      data: {
        fieldKey,
        label,
        section: section || "個人情報",
        fieldType,
        isEnabled,
        isRequired,
        displayOrder,
        schoolId: schoolId || null,
        description: description || null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

// PUT: upsert array of field configs (with schoolId field)
export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  if (!checkAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "配列形式で送信してください" }, { status: 400 });
    }

    const results = await Promise.all(
      body.map((item: {
        fieldKey: string;
        schoolId?: string | null;
        label: string;
        section: string;
        fieldType?: string;
        isEnabled: boolean;
        isRequired: boolean;
        displayOrder: number;
        description?: string | null;
      }) => {
        const schoolId = item.schoolId ?? null;
        return prisma.formFieldConfig.upsert({
          where: {
            fieldKey_schoolId: {
              fieldKey: item.fieldKey,
              schoolId: schoolId as string,
            },
          },
          update: {
            label: item.label,
            section: item.section,
            fieldType: item.fieldType ?? "text",
            isEnabled: item.isEnabled,
            isRequired: item.isRequired,
            displayOrder: item.displayOrder,
            description: item.description ?? null,
          },
          create: {
            fieldKey: item.fieldKey,
            schoolId: schoolId,
            label: item.label,
            section: item.section,
            fieldType: item.fieldType ?? "text",
            isEnabled: item.isEnabled,
            isRequired: item.isRequired,
            displayOrder: item.displayOrder,
            description: item.description ?? null,
          },
        });
      })
    );

    return NextResponse.json(results);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}

// DELETE: delete a field config (only custom_ or doc_ prefixed fields)
export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!checkAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fieldKey, schoolId = null } = body;

    if (!fieldKey) {
      return NextResponse.json({ error: "fieldKeyは必須です" }, { status: 400 });
    }

    // Only allow deleting custom_ or doc_ prefixed fields to protect core fields
    if (!fieldKey.startsWith("custom_") && !fieldKey.startsWith("doc_")) {
      return NextResponse.json({ error: "コアフィールドは削除できません" }, { status: 403 });
    }

    await prisma.formFieldConfig.delete({
      where: {
        fieldKey_schoolId: {
          fieldKey,
          schoolId: schoolId as string,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
