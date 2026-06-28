import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";
import { ENV } from "@/lib/env";
import { logError } from "@/lib/logger";
import {
  getFileFields,
  checkCompleteness,
  checkResidenceExpiry,
  checkFormats,
  compareExtraction,
  checkDocLabel,
  type DocCheckItem,
  type DocExtraction,
} from "@/lib/docCheck";

export const dynamic = "force-dynamic";

// GET: 書類チェック（0-token ルール層 + 保存済み AI 照合結果）
export const GET = withTenant(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "document.review"))) {
    return NextResponse.json({ error: "書類を審査する権限がありません" }, { status: 403 });
  }
  try {
    const app = await getTenantDb().application.findFirst({
      where: { id: params.id },
      select: {
        id: true,
        birthDate: true,
        residenceStatus: true,
        residenceExpiry: true,
        applySchool: { select: { schoolKey: true } },
        documents: {
          select: {
            id: true,
            docType: true,
            mimeType: true,
            originalName: true,
            status: true,
            aiExtraction: true,
            aiExtractedAt: true,
            aiModel: true,
          },
        },
      },
    });
    if (!app) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });

    const fields = await getFileFields(app.applySchool?.schoolKey ?? null);

    const rules: DocCheckItem[] = [];
    rules.push(...checkCompleteness(fields, app.documents));
    const exp = checkResidenceExpiry(app.residenceExpiry);
    if (exp) rules.push(exp);
    rules.push(...checkFormats(app.documents));

    // 保存済み AI 抽出があれば照合結果も返す（再課金なし）
    const documents = app.documents.map((d) => {
      let extraction: DocExtraction | null = null;
      let comparison: DocCheckItem[] = [];
      if (d.aiExtraction) {
        try {
          extraction = JSON.parse(d.aiExtraction) as DocExtraction;
          comparison = compareExtraction(extraction, app);
          const labelCheck = checkDocLabel(extraction, d.docType);
          if (labelCheck) comparison.unshift(labelCheck);
        } catch {
          extraction = null;
        }
      }
      return {
        id: d.id,
        docType: d.docType,
        mimeType: d.mimeType,
        originalName: d.originalName,
        status: d.status,
        aiExtractedAt: d.aiExtractedAt,
        aiModel: d.aiModel,
        extraction,
        comparison,
      };
    });

    return NextResponse.json({
      aiEnabled: !!ENV.ANTHROPIC_API_KEY,
      rules,
      documents,
    });
  } catch (e) {
    logError("GET /api/applications/[id]/doc-check", e);
    return NextResponse.json({ error: "書類チェックに失敗しました" }, { status: 500 });
  }
});
