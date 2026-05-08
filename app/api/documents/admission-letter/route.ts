import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAdmissionPDF } from "@/lib/pdf/generate-pdf";
import { verifyStudentOwnership, checkRateLimit } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const applicationNo = searchParams.get("applicationNo");
    const email = searchParams.get("email");
    const type = (searchParams.get("type") || "admission_notice") as "admission_notice" | "admission_permit";

    if (!applicationNo || !email) {
      return NextResponse.json({ error: "パラメータが不足しています" }, { status: 400 });
    }

    // PDFダウンロードにもレートリミット
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`pdf:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
    }

    // 学生本人確認（大文字小文字区別なし）
    const ownership = await verifyStudentOwnership(applicationNo, email);
    if (!ownership.valid) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    const application = await prisma.application.findUnique({
      where: { id: ownership.applicationId },
      include: { enrollmentProcedure: true },
    });

    if (!application) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    if (!["合格", "補欠合格"].includes(application.status)) {
      return NextResponse.json({ error: "合格者のみダウンロードできます" }, { status: 403 });
    }

    if (type === "admission_permit" && !application.enrollmentProcedure?.schoolConfirmed) {
      return NextResponse.json({ error: "入学許可書はまだ発行されていません" }, { status: 403 });
    }

    const issueDate = new Date().toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric",
    });

    const pdfBuffer = await generateAdmissionPDF({
      type,
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
      issueDate,
      issuedBy: "学校法人 入学審査委員会",
    });

    const fileName = type === "admission_permit"
      ? `入学許可書_${applicationNo}.pdf`
      : `合格通知書_${applicationNo}.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error("GET /api/documents/admission-letter error:", error);
    return NextResponse.json({ error: "PDF生成に失敗しました" }, { status: 500 });
  }
}
