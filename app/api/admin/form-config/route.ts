import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";
import { FORM_FIELD_DEFAULTS, defaultEnabledFor } from "@/lib/formFieldDefaults";
import { OC_FORM_DEFAULTS } from "@/lib/ocForm";
import { isApplicantType, type ApplicantType } from "@/lib/applicantType";
import { translateLabelsToEn } from "@/lib/translateFormLabels";
import { aiEnabled } from "@/lib/anthropic";

// schoolId=xxx -> school-specific merged with global
// schoolId not provided -> global only
// applicantType=japanese|foreign -> その (schoolId, applicantType) スコープの設定行を返す
// applicantType 未指定（共通）-> applicantType=null。共通スコープは従来挙動を一切変えない。
export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!checkAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") || null;
    // formType: "apply"（既定）/ "oc"。OC は applicantType 次元を持たない（常に null）。
    const formType = searchParams.get("formType") === "oc" ? "oc" : "apply";

    // OC フォーム: 基準は OC_FORM_DEFAULTS、スコープは (schoolId, applicantType=null, formType=oc)。
    // 保存行があればそれを、無ければ既定から補完。apply とは独立。
    if (formType === "oc") {
      const ocConfigs = await getTenantDb().formFieldConfig.findMany({
        where: { schoolId, applicantType: null, formType: "oc" },
        orderBy: { displayOrder: "asc" },
      });
      const ocMap = new Map(ocConfigs.map((c) => [c.fieldKey, c]));
      const allKeys = new Set([
        ...OC_FORM_DEFAULTS.map((f) => f.fieldKey),
        ...Array.from(ocMap.keys()),
      ]);
      const ocResult = Array.from(allKeys).map((fieldKey) => {
        const stored = ocMap.get(fieldKey);
        if (stored) return { ...stored, isCustom: true };
        const def = OC_FORM_DEFAULTS.find((f) => f.fieldKey === fieldKey);
        if (def) {
          return {
            id: "",
            fieldKey: def.fieldKey,
            schoolId,
            applicantType: null,
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
      ocResult.sort((a, b) => (a!.displayOrder ?? 0) - (b!.displayOrder ?? 0));
      return NextResponse.json(ocResult);
    }

    // クエリ applicantType を読む。未指定 or 不正値は null（共通）として扱う。
    const applicantTypeParam = searchParams.get("applicantType");
    const applicantType: ApplicantType | null = isApplicantType(applicantTypeParam)
      ? applicantTypeParam
      : null;

    // 特定の applicantType が指定された場合: その (schoolId, applicantType) スコープを返す。
    // 保存済み行があればそれを、無ければ FORM_FIELD_DEFAULTS から defaultEnabledFor で補完。
    if (applicantType) {
      const scopedConfigs = await getTenantDb().formFieldConfig.findMany({
        where: { schoolId, applicantType, formType: "apply" },
        orderBy: { displayOrder: "asc" },
      });
      const scopedMap = new Map(scopedConfigs.map((c) => [c.fieldKey, c]));

      const allFieldKeys = new Set([
        ...FORM_FIELD_DEFAULTS.map((f) => f.fieldKey),
        ...Array.from(scopedMap.keys()),
      ]);

      const result = Array.from(allFieldKeys).map((fieldKey) => {
        const stored = scopedMap.get(fieldKey);
        if (stored) {
          // EXACT (schoolId, applicantType) スコープに保存行あり -> isCustom: true
          return { ...stored, isCustom: true };
        }
        const def = FORM_FIELD_DEFAULTS.find((f) => f.fieldKey === fieldKey);
        if (def) {
          return {
            id: "",
            fieldKey: def.fieldKey,
            schoolId,
            applicantType,
            label: def.label,
            section: def.section,
            fieldType: def.fieldType,
            // japanese は留学生専用項目を既定オフにする
            isEnabled: defaultEnabledFor(def.fieldKey, applicantType),
            isRequired: def.isRequired,
            displayOrder: def.displayOrder,
            isCustom: false,
          };
        }
        return null;
      }).filter(Boolean);

      result.sort((a, b) => (a!.displayOrder ?? 0) - (b!.displayOrder ?? 0));
      return NextResponse.json(result);
    }

    // ===== 以下、applicantType 未指定 =====
    // 共通(applicantType=null)スコープは廃止。管理者は null スコープを編集しないため、
    // DB の null 行は一切読まず、合成した型なし既定（isEnabled:true）だけを返す。
    // 実運用では UI が常に applicantType を付与する（上のタイプ別パスに入る）。
    const defaults = FORM_FIELD_DEFAULTS.map(def => ({
      id: "",
      fieldKey: def.fieldKey,
      schoolId,
      label: def.label,
      section: def.section,
      fieldType: def.fieldType,
      isEnabled: true,
      isRequired: def.isRequired,
      displayOrder: def.displayOrder,
      isCustom: false,
    })).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    return NextResponse.json(defaults);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

// POST: create a new field config
export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
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
      options = null,
      showWhenExamMode = null,
      applicantType = null,
      formType = "apply",
    } = body;

    if (!label) {
      return NextResponse.json({ error: "ラベルは必須です" }, { status: 400 });
    }

    // Auto-generate fieldKey from label if not provided
    const fieldKey = body.fieldKey || `custom_${Date.now()}`;

    const created = await getTenantDb().formFieldConfig.create({
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
        options: options || null,
        showWhenExamMode: showWhenExamMode || null,
        applicantType: isApplicantType(applicantType) ? applicantType : null,
        formType: formType === "oc" ? "oc" : "apply",
        updatedAt: new Date(),
      },
    });

    // 追加的副作用: 新規ラベル/ヒントをAI英訳して labelEn/descriptionEn 保存。
    // キー未設定（aiEnabled()=false）や失敗時は no-op（作成は壊さない）。
    if (aiEnabled() && created.label) {
      try {
        const tr = await translateLabelsToEn([
          { key: "L", ja: created.label },
          { key: "D", ja: created.description || "" },
        ]);
        if (tr.L || tr.D) {
          await getTenantDb().formFieldConfig.update({
            where: { id: created.id },
            data: { labelEn: tr.L ?? null, descriptionEn: tr.D ?? null },
          });
        }
      } catch {
        // 翻訳失敗は無視（作成済みデータは返す）
      }
    }

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
});

// PUT: upsert array of field configs (with schoolId field)
export const PUT = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "出願フォームを編集する権限がありません" }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "配列形式で送信してください" }, { status: 400 });
    }

    const db = getTenantDb();
    const results = await Promise.all(
      body.map((item: {
        fieldKey: string;
        schoolId?: string | null;
        applicantType?: string | null;
        formType?: string | null;
        label: string;
        section: string;
        fieldType?: string;
        isEnabled: boolean;
        isRequired: boolean;
        displayOrder: number;
        description?: string | null;
        options?: string | null;
        showWhenExamMode?: string | null;
      }) => {
        const schoolId = item.schoolId ?? null;
        // applicantType: 非nullかつ不正値は安全側で null（共通）に丸める。
        const applicantType = isApplicantType(item.applicantType) ? item.applicantType : null;
        // formType: 既定 "apply"。"oc" のみ別系統。unique scope は [fieldKey,schoolId,applicantType,formType]。
        const formType = item.formType === "oc" ? "oc" : "apply";
        const updateData = {
          label: item.label,
          section: item.section,
          fieldType: item.fieldType ?? "text",
          isEnabled: item.isEnabled,
          isRequired: item.isRequired,
          displayOrder: item.displayOrder,
          description: item.description ?? null,
          options: item.options ?? null,
          showWhenExamMode: item.showWhenExamMode ?? null,
        };
        // schoolId/applicantType に null を含み得るため、Prisma の compound unique upsert は使えない。
        // 従来どおり findFirst + update/create で (fieldKey, schoolId, applicantType) スコープを確定する。
        // 既知の制約: SQLite は unique index 内の NULL を区別するため、null スコープ
        // (全校共通/共通タイプ) では一意制約が効かず、同時保存で重複行が生じ得る。単一管理者・
        // 1リクエスト=1スコープの運用前提で許容（厳密化が必要になれば sentinel 値かトランザクション直列化）。
        return db.formFieldConfig.findFirst({
          where: { fieldKey: item.fieldKey, schoolId, applicantType, formType },
        }).then(async existing => {
          // updateData は labelEn/descriptionEn を含まないため、update は既存の英訳値を保持する
          // (null 上書きしない)。create では未指定 = null（後段の翻訳パスで補完）。
          const description = item.description ?? null;
          const needLabel = !!item.label?.trim() && (!existing || existing.label !== item.label || !existing.labelEn);
          const needDesc = !!description?.trim() && (!existing || existing.description !== description || !existing.descriptionEn);
          const row = existing
            ? await db.formFieldConfig.update({ where: { id: existing.id }, data: updateData })
            : await db.formFieldConfig.create({
                data: { id: require("crypto").randomUUID(), fieldKey: item.fieldKey, schoolId, applicantType, formType, updatedAt: new Date(), ...updateData },
              });
          return { row, fieldKey: item.fieldKey, label: item.label, description, needLabel, needDesc };
        });
      })
    );

    // 追加的副作用: 新規/変更されたラベル・ヒントを1回のバッチでAI英訳し labelEn/descriptionEn 保存。
    // キー未設定（aiEnabled()=false）なら translateLabelsToEn は {} を返し second pass はスキップ
    // → labelEn/descriptionEn は据え置き（新規は null）で従来挙動のまま。
    const transItems: { key: string; ja: string }[] = [];
    for (const r of results) {
      if (r.needLabel) transItems.push({ key: "L:" + r.fieldKey, ja: r.label });
      if (r.needDesc && r.description) transItems.push({ key: "D:" + r.fieldKey, ja: r.description });
    }
    const tr = transItems.length ? await translateLabelsToEn(transItems) : {};
    if (Object.keys(tr).length) {
      await Promise.all(
        results.map((r) => {
          const labelEn = tr["L:" + r.fieldKey];
          const descEn = tr["D:" + r.fieldKey];
          if (!labelEn && !descEn) return null;
          return db.formFieldConfig.update({
            where: { id: r.row.id },
            data: {
              ...(labelEn ? { labelEn } : {}),
              ...(descEn ? { descriptionEn: descEn } : {}),
            },
          });
        }).filter(Boolean) as Promise<unknown>[]
      );
    }

    // クライアント互換: 従来どおり永続化された行の配列を返す。
    return NextResponse.json(results.map((r) => r.row));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
});

// DELETE: delete a field config (only custom_ or doc_ prefixed fields)
export const DELETE = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "出願フォームを編集する権限がありません" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { fieldKey, schoolId = null, applicantType = null } = body;

    if (!fieldKey) {
      return NextResponse.json({ error: "fieldKeyは必須です" }, { status: 400 });
    }

    // Only allow deleting custom_ or doc_ prefixed fields to protect core fields
    if (!fieldKey.startsWith("custom_") && !fieldKey.startsWith("doc_")) {
      return NextResponse.json({ error: "コアフィールドは削除できません" }, { status: 403 });
    }

    const db = getTenantDb();
    // (schoolId, applicantType) スコープを厳密に一致させ、別タイプの行を誤削除しない。
    const scopedApplicantType = isApplicantType(applicantType) ? applicantType : null;
    const target = await db.formFieldConfig.findFirst({ where: { fieldKey, schoolId, applicantType: scopedApplicantType } });
    if (!target) return NextResponse.json({ error: "フィールドが見つかりません" }, { status: 404 });
    await db.formFieldConfig.delete({ where: { id: target.id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
});

// PATCH: 特定学校の全カスタム設定を削除（全校共通に戻す）
export const PATCH = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "出願フォームを編集する権限がありません" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("resetSchoolId");
    if (!schoolId) return NextResponse.json({ error: "resetSchoolIdが必要です" }, { status: 400 });
    const result = await getTenantDb().formFieldConfig.deleteMany({ where: { schoolId } });
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "リセットに失敗しました" }, { status: 500 });
  }
});
