import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/auth";

// GET: 申請番号とメールで状態確認
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`application-status:${ip}`, 20, 60_000)) {
      return NextResponse.json({ error: "アクセスが多すぎます" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const applicationNo = searchParams.get("applicationNo");
    const email = searchParams.get("email");

    if (!applicationNo || !email) {
      return NextResponse.json(
        { error: "申請番号とメールアドレスを入力してください" },
        { status: 400 }
      );
    }

    const application = await prisma.application.findUnique({
      where: { applicationNo },
      include: {
        documents: {
          select: {
            id: true,
            docType: true,
            fileName: true,
            originalName: true,
            uploadedAt: true,
          },
        },
        enrollmentProcedure: true,
        enrollmentSignature: {
          select: {
            id: true,
            signedAt: true,
            signerName: true,
          },
        },
      },
    });

    if (!application || application.email !== email) {
      return NextResponse.json(
        { error: "申請が見つかりません。申請番号またはメールアドレスをご確認ください。" },
        { status: 404 }
      );
    }

    // 公開情報のみ返す
    return NextResponse.json({
      id: application.id,
      applicationNo: application.applicationNo,
      status: application.status,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      // 個人情報（Resume フロー・Step5確認画面で使用）
      lastName: application.lastName,
      firstName: application.firstName,
      lastNameKana: application.lastNameKana,
      firstNameKana: application.firstNameKana,
      birthDate: application.birthDate,
      gender: application.gender,
      nationality: application.nationality,
      phone: application.phone,
      email: application.email,
      postalCode: application.postalCode,
      prefecture: application.prefecture,
      city: application.city,
      address: application.address,
      addressDetail: application.addressDetail,
      residenceStatus: application.residenceStatus,
      residenceExpiry: application.residenceExpiry,
      japaneseLevel: application.japaneseLevel,
      jlptCertified: application.jlptCertified,
      schoolId: application.schoolName, // schoolKey は schoolName で代替
      schoolName: application.schoolName,
      department: application.department,
      course: application.course,
      enrollmentYear: application.enrollmentYear,
      enrollmentMonth: application.enrollmentMonth,
      applicationReason: application.applicationReason,
      lastSchoolName: application.lastSchoolName,
      lastSchoolCountry: application.lastSchoolCountry,
      lastSchoolGraduate: application.lastSchoolGraduate,
      workExperience: application.workExperience,
      examMode: application.examMode,
      referrerName: application.referrerName,
      referrerType: application.referrerType,
      examFeeStatus: application.examFeeStatus,
      documents: application.documents,
      // 面接情報（面接待ちの場合のみ公開）
      interviewDate: application.status === "面接待ち" ? application.interviewDate : null,
      interviewTime: application.status === "面接待ち" ? application.interviewTime : null,
      interviewPlace: application.status === "面接待ち" ? application.interviewPlace : null,
      interviewNotes: application.status === "面接待ち" ? application.interviewNotes : null,
      // 入学手続き（合格・補欠合格の場合は常に表示）
      enrollmentProcedure: (application.status === "合格" || application.status === "補欠合格") && application.enrollmentProcedure
        ? {
            instructions: application.enrollmentProcedure.instructions,
            deadline: application.enrollmentProcedure.deadline,
            status: application.enrollmentProcedure.status,
            completedAt: application.enrollmentProcedure.completedAt,
            studentMemo: application.enrollmentProcedure.studentMemo,
            publishedAt: application.enrollmentProcedure.publishedAt,
            docChecklist: application.enrollmentProcedure.docChecklist,
            step1Deadline: application.enrollmentProcedure.step1Deadline,
            step2Deadline: application.enrollmentProcedure.step2Deadline,
            step3Deadline: application.enrollmentProcedure.step3Deadline,
            tuitionPlan: application.enrollmentProcedure.tuitionPlan,
            tuitionAmount: application.enrollmentProcedure.tuitionAmount,
            tuitionAmount2: application.enrollmentProcedure.tuitionAmount2,
            tuitionDeadline2: application.enrollmentProcedure.tuitionDeadline2,
            tuitionBankInfo: application.enrollmentProcedure.tuitionBankInfo,
            // 学校承認フロー
            schoolConfirmed: application.enrollmentProcedure.schoolConfirmed,
            schoolConfirmedAt: application.enrollmentProcedure.schoolConfirmedAt,
            admitLetterIssued: application.enrollmentProcedure.admitLetterIssued,
            admitLetterIssuedAt: application.enrollmentProcedure.admitLetterIssuedAt,
            // 入学式・ビザ案内
            ceremonyNotified: application.enrollmentProcedure.ceremonyNotified,
            ceremonyDate: application.enrollmentProcedure.ceremonyDate,
            ceremonyPlace: application.enrollmentProcedure.ceremonyPlace,
            ceremonyNotes: application.enrollmentProcedure.ceremonyNotes,
            visaGuideNotified: application.enrollmentProcedure.visaGuideNotified,
            visaGuideNotes: application.enrollmentProcedure.visaGuideNotes,
          }
        : null,
      // 電子署名情報（合格・補欠合格の場合のみ）
      enrollmentSignature: (application.status === "合格" || application.status === "補欠合格") && application.enrollmentSignature
        ? {
            id: application.enrollmentSignature.id,
            signedAt: application.enrollmentSignature.signedAt,
            signerName: application.enrollmentSignature.signerName,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/applications/status error:", error);
    return NextResponse.json(
      { error: "状態の確認に失敗しました" },
      { status: 500 }
    );
  }
}
