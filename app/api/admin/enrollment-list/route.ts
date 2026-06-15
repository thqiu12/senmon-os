import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const stepFilter = searchParams.get("step"); // announced|step1|step2|schoolConfirm|admitLetter|all
  const search = searchParams.get("search") || "";
  const schoolFilter = searchParams.get("school") || "";
  const cohortFilter = searchParams.get("cohortId") || "";

  try {
    const applications = await prisma.application.findMany({
      where: {
        deletedAt: null,
        status: { in: ["合格", "補欠合格"] },
        ...(search ? {
          OR: [
            { lastName: { contains: search } },
            { firstName: { contains: search } },
            { lastNameKana: { contains: search } },
            { firstNameKana: { contains: search } },
            { applicationNo: { contains: search } },
          ],
        } : {}),
        ...(schoolFilter ? { schoolName: { contains: schoolFilter } } : {}),
        ...(cohortFilter && cohortFilter !== "all"
          ? cohortFilter === "none" ? { cohortId: null } : { cohortId: cohortFilter }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      include: {
        enrollmentProcedure: true,
        cohort: { select: { id: true, name: true } },
        applicationSchools: { orderBy: { priority: "asc" }, take: 1 },
      },
    });

    // ステップ計算
    const getStep = (ep: {
      admitLetterIssued: boolean;
      schoolConfirmed: boolean;
      status: string;
    } | null): string => {
      if (!ep) return "not_started";
      if (ep.admitLetterIssued) return "admitLetter";
      if (ep.schoolConfirmed) return "schoolConfirm";
      if (ep.status === "STEP3完了" || ep.status === "完了") return "step3done";
      if (ep.status === "STEP2完了") return "step2done";
      if (ep.status === "STEP1完了") return "step2";
      if (ep.status === "案内済み") return "step1";
      return "announced";
    };

    const result = applications
      .map(app => ({
        id: app.id,
        applicationNo: app.applicationNo,
        lastName: app.lastName,
        firstName: app.firstName,
        lastNameKana: app.lastNameKana,
        firstNameKana: app.firstNameKana,
        status: app.status,
        schoolName: app.applicationSchools[0]?.schoolName ?? app.schoolName,
        department: app.applicationSchools[0]?.department ?? app.department,
        enrollmentYear: app.enrollmentYear,
        enrollmentMonth: app.enrollmentMonth,
        cohort: app.cohort,
        createdAt: app.createdAt,
        ep: app.enrollmentProcedure ? {
          id: app.enrollmentProcedure.id,
          status: app.enrollmentProcedure.status,
          publishedAt: app.enrollmentProcedure.publishedAt,
          tuitionPaid: app.enrollmentProcedure.tuitionPaid,
          tuitionPaidAt: app.enrollmentProcedure.tuitionPaidAt,
          docSubmitted: app.enrollmentProcedure.docSubmitted,
          docSubmittedAt: app.enrollmentProcedure.docSubmittedAt,
          schoolConfirmed: app.enrollmentProcedure.schoolConfirmed,
          schoolConfirmedAt: app.enrollmentProcedure.schoolConfirmedAt,
          admitLetterIssued: app.enrollmentProcedure.admitLetterIssued,
          admitLetterIssuedAt: app.enrollmentProcedure.admitLetterIssuedAt,
          ceremonyNotified: app.enrollmentProcedure.ceremonyNotified,
          visaGuideNotified: app.enrollmentProcedure.visaGuideNotified,
          adminNote: app.enrollmentProcedure.adminNote,
          visaStatus: app.enrollmentProcedure.visaStatus,
          dormApply: app.enrollmentProcedure.dormApply,
          dormStatus: app.enrollmentProcedure.dormStatus,
          updatedAt: app.enrollmentProcedure.updatedAt,
        } : null,
        step: getStep(app.enrollmentProcedure),
      }))
      .filter(a => {
        if (!stepFilter || stepFilter === "all") return true;
        if (stepFilter === "not_started") return a.step === "not_started" || a.step === "announced";
        if (stepFilter === "step1") return a.step === "step1";
        if (stepFilter === "step2") return a.step === "step2" || a.step === "step2done";
        if (stepFilter === "step3") return a.step === "step3done";
        if (stepFilter === "schoolConfirm") return a.step === "schoolConfirm";
        if (stepFilter === "admitLetter") return a.step === "admitLetter";
        return true;
      });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/admin/enrollment-list error:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
