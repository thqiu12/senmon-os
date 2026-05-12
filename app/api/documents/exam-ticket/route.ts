import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyStudentOwnership } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { generateExamTicketPDF } from "@/lib/pdf/exam-ticket";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`exam-ticket:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const applicationNo = searchParams.get("applicationNo");
    const email = searchParams.get("email");
    if (!applicationNo || !email) {
      return NextResponse.json({ error: "パラメータが不足しています" }, { status: 400 });
    }

    const ownership = await verifyStudentOwnership(applicationNo, email);
    if (!ownership.valid) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    const app = await prisma.application.findUnique({
      where: { id: ownership.applicationId },
      include: {
        documents: {
          select: { docType: true, status: true, filePath: true, uploadedAt: true },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });
    if (!app) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    // 受験票発行条件:
    //   ① ステータスが「面接待ち」（書類審査通過の管理者シグナル）
    //   ② 試験日程 (interviewDate) が確定している
    //   ③ 差し戻し中の書類がない
    const isReady = app.status === "面接待ち";
    const hasInterviewSlot = !!app.interviewDate;
    const hasRejection = app.documents.some((d) => d.status === "差し戻し");

    if (!isReady) {
      return NextResponse.json(
        { error: "書類審査通過後にダウンロードできます。" },
        { status: 403 },
      );
    }
    if (!hasInterviewSlot) {
      return NextResponse.json(
        { error: "試験日程が確定するまでお待ちください。" },
        { status: 403 },
      );
    }
    if (hasRejection) {
      return NextResponse.json(
        { error: "差し戻された書類があります。再提出後に発行可能になります。" },
        { status: 403 },
      );
    }

    // 写真: 最新の証明写真。優先順は 確認済 > 提出済 で、差し戻し済みは除外
    const photoDocs = app.documents.filter(
      (d) => d.docType === "証明写真（3×3cm）" && d.status !== "差し戻し",
    );
    const photoDoc =
      photoDocs.find((d) => d.status === "確認済") ?? photoDocs[0] ?? null;

    const issueDate = new Date().toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric",
    });

    const pdfBuffer = await generateExamTicketPDF({
      applicationNo: app.applicationNo,
      applicantName: `${app.lastName} ${app.firstName}`,
      applicantNameKana: `${app.lastNameKana} ${app.firstNameKana}`,
      nationality: app.nationality,
      birthDate: app.birthDate,
      gender: app.gender,
      schoolName: app.schoolName,
      department: app.department,
      course: app.course || "",
      enrollmentYear: app.enrollmentYear,
      enrollmentMonth: app.enrollmentMonth,
      examMode: app.examMode || "一般",
      interviewDate: app.interviewDate,
      interviewTime: app.interviewTime,
      interviewPlace: app.interviewPlace,
      interviewNotes: app.interviewNotes,
      photoFilePath: photoDoc?.filePath ?? null,
      issueDate,
    });

    const fileName = `受験票_${applicationNo}.pdf`;
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    logError("GET /api/documents/exam-ticket", error);
    return NextResponse.json({ error: "PDF生成に失敗しました" }, { status: 500 });
  }
}
