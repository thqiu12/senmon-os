import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin, isCoreAdmin } from "@/lib/auth";
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

    // 不足しているデフォルトフィールドを一括挿入
    const existingKeys = await prisma.formFieldConfig.findMany({
      where: { schoolId: null },
      select: { fieldKey: true },
    });
    const existingKeySet = new Set(existingKeys.map((e) => e.fieldKey));
    const missing = FORM_FIELD_DEFAULTS.filter((f) => !existingKeySet.has(f.fieldKey));
    if (missing.length > 0) {
      await prisma.formFieldConfig.createMany({
        data: missing.map((f) => ({
          fieldKey: f.fieldKey,
          label: f.label,
          section: f.section,
          isEnabled: true,
          isRequired: f.isRequired,
          displayOrder: f.displayOrder,
          fieldType: f.fieldType,
          schoolId: null,
        })),
      });
    }

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
  if (!isCoreAdmin(session)) {
    return NextResponse.json({ error: "出願フォームを編集する権限がありません" }, { status: 403 });
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
        id: require("crypto").randomUUID(),
        fieldKey,
        label,
        section: section || "個人情報",
        fieldType,
        isEnabled,
        isRequired,
        displayOrder,
        schoolId: schoolId || null,
        description: description || null,
        updatedAt: new Date(),
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
  if (!isCoreAdmin(session)) {
    return NextResponse.json({ error: "出願フォームを編集する権限がありません" }, { status: 403 });
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
        const updateData = {
          label: item.label,
          section: item.section,
          fieldType: item.fieldType ?? "text",
          isEnabled: item.isEnabled,
          isRequired: item.isRequired,
          displayOrder: item.displayOrder,
          description: item.description ?? null,
        };
        // schoolId=null の場合、Prisma の compound unique upsert が使えないため findFirst + update/create
        return prisma.formFieldConfig.findFirst({
          where: { fieldKey: item.fieldKey, schoolId },
        }).then(existing => {
          if (existing) {
            return prisma.formFieldConfig.update({ where: { id: existing.id }, data: updateData });
          }
          return prisma.formFieldConfig.create({
            data: { id: require("crypto").randomUUID(), fieldKey: item.fieldKey, schoolId, updatedAt: new Date(), ...updateData },
          });
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
  if (!isCoreAdmin(session)) {
    return NextResponse.json({ error: "出願フォームを編集する権限がありません" }, { status: 403 });
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

    const target = await prisma.formFieldConfig.findFirst({ where: { fieldKey, schoolId } });
    if (!target) return NextResponse.json({ error: "フィールドが見つかりません" }, { status: 404 });
    await prisma.formFieldConfig.delete({ where: { id: target.id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}

// PATCH: 特定学校の全カスタム設定を削除（グローバルに戻す）
export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isCoreAdmin(session)) {
    return NextResponse.json({ error: "出願フォームを編集する権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("resetSchoolId");
    if (!schoolId) return NextResponse.json({ error: "resetSchoolIdが必要です" }, { status: 400 });
    const result = await prisma.formFieldConfig.deleteMany({ where: { schoolId } });
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "リセットに失敗しました" }, { status: 500 });
  }
}
