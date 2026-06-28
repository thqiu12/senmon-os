import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { generateEnrollmentPledgePDF } from "@/lib/pdf/generate-pdf";
import { verifyStudentOwnership, getSession, isAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security";

// 入学誓約書（電子署名済み）のPDF。学生本人（出願番号＋メール）または管理者がDL可能。
export const GET = withTenant(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const applicationNo = searchParams.get("applicationNo");
    const email = searchParams.get("email");

    if (!applicationNo) {
      return NextResponse.json({ error: "パラメータが不足しています" }, { status: 400 });
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(`pdf:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
    }

    const db = getTenantDb();

    // 管理者はメール不要、学生は本人確認
    const session = await getSession(request);
    const admin = !!session && isAdmin(session);
    let applicationId: string | null = null;
    if (admin) {
      const app = await db.application.findFirst({ where: { applicationNo }, select: { id: true } });
      applicationId = app?.id ?? null;
    } else {
      if (!email) {
        return NextResponse.json({ error: "パラメータが不足しています" }, { status: 400 });
      }
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) {
        return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
      }
      applicationId = ownership.applicationId ?? null;
    }
    if (!applicationId) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    const application = await db.application.findFirst({
      where: { id: applicationId },
      include: { enrollmentSignature: true },
    });
    if (!application) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }
    const sig = application.enrollmentSignature;
    if (!sig) {
      return NextResponse.json({ error: "入学誓約書はまだ署名されていません" }, { status: 404 });
    }

    const signedAt = new Date(sig.signedAt).toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric",
    });

    const pdfBuffer = await generateEnrollmentPledgePDF({
      applicationNo: application.applicationNo,
      applicantName: `${application.lastName} ${application.firstName}`,
      applicantNameKana: `${application.lastNameKana} ${application.firstNameKana}`,
      nationality: application.nationality,
      birthDate: application.birthDate,
      schoolName: application.schoolName,
      department: application.department,
      course: application.course || "",
      enrollmentYear: application.enrollmentYear,
      enrollmentMonth: application.enrollmentMonth,
      signerName: sig.signerName,
      signedAt,
      signatureDataUri: sig.signatureData,
    });

    const fileName = `入学誓約書_${applicationNo}.pdf`;
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error("GET /api/documents/enrollment-pledge error:", error);
    return NextResponse.json({ error: "PDF生成に失敗しました" }, { status: 500 });
  }
});
