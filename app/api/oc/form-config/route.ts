import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { OC_FORM_DEFAULTS, mergeOCForm } from "@/lib/ocForm";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (request: NextRequest) => {
  try {
    const schoolId = new URL(request.url).searchParams.get("school") || null;
    const rows = await getTenantDb().formFieldConfig.findMany({
      where: { formType: "oc", schoolId, applicantType: null },
      orderBy: { displayOrder: "asc" },
    });
    return NextResponse.json(mergeOCForm(OC_FORM_DEFAULTS, rows as any));
  } catch {
    return NextResponse.json(mergeOCForm(OC_FORM_DEFAULTS, []));
  }
});
