import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { verifyStudentOwnership } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import crypto from "crypto";

const STUDENT_INCLUDE = {
  school: { select: { id: true, name: true } },
  class: {
    select: {
      id: true, name: true,
      course: { select: { name: true } },
      timetables: {
        where: { isActive: true },
        include: {
          slots: {
            orderBy: [{ dayOfWeek: "asc" as const }, { period: "asc" as const }],
            include: {
              subject: { select: { name: true } },
              teacher: { select: { name: true } },
            },
          },
        },
        take: 1,
      },
    },
  },
};

// withTenant 文脈内(GET)から呼ばれる → getTenantDb() が org スコープで使える。
async function getStudentData(student: { id: string }) {
  const db = getTenantDb();
  // 出席記録（直近3ヶ月）
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const dateFrom = threeMonthsAgo.toISOString().slice(0, 10);

  const [attendances, leaveRequests, certRequests, homeworkSubs, chatMessages] = await Promise.all([
    db.attendance.findMany({
      where: { studentId: student.id, date: { gte: dateFrom } },
      orderBy: { date: "desc" },
      include: { subject: { select: { name: true } } },
      take: 100,
    }),
    db.leaveRequest.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.certificateRequest.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.homeworkSubmission.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      include: {
        homework: {
          select: {
            title: true, dueDate: true, maxScore: true, isPublished: true,
            subject: { select: { name: true } },
          },
        },
      },
      take: 30,
    }),
    db.chatMessage.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);

  const total = attendances.length;
  const present = attendances.filter(a => ["出席", "遅刻"].includes(a.status)).length;
  const attendanceRate = total > 0 ? Math.round((present / total) * 100) : null;

  return {
    attendanceRate,
    attendanceSummary: {
      total,
      present: attendances.filter(a => a.status === "出席").length,
      late: attendances.filter(a => a.status === "遅刻").length,
      absent: attendances.filter(a => a.status === "欠席").length,
      publicLeave: attendances.filter(a => a.status === "公欠").length,
    },
    recentAttendances: attendances.slice(0, 30),
    leaveRequests,
    certRequests,
    homeworkSubs,
    chatMessages,
  };
}

// GET: 学生ポータルデータ取得
export const GET = withTenant(async (request: NextRequest) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`portal:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "アクセスが多すぎます" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const applicationNo = searchParams.get("applicationNo");
  const studentNo = searchParams.get("studentNo");
  const email = searchParams.get("email");

  if (!email) return NextResponse.json({ error: "メールアドレスが必要です" }, { status: 400 });

  try {
    const db = getTenantDb();
    let student = null;

    if (studentNo) {
      // 在籍学生ポータル：学籍番号+メールで検索
      student = await db.student.findFirst({
        where: { studentNo, email },
        include: STUDENT_INCLUDE,
      });
      if (!student) return NextResponse.json({ enrolled: false });
    } else if (applicationNo) {
      // 出願経由：applicationNo+メールで本人確認してから検索
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) return NextResponse.json({ enrolled: false });
      student = await db.student.findFirst({
        where: { applicationId: ownership.applicationId },
        include: STUDENT_INCLUDE,
      });
      if (!student) return NextResponse.json({ enrolled: false });
    } else {
      return NextResponse.json({ error: "studentNoまたはapplicationNoが必要です" }, { status: 400 });
    }

    const extra = await getStudentData(student);
    const classData = student.class as { id: string; name: string; course: { name: string }; timetables: { slots: unknown[] }[] } | null;

    return NextResponse.json({
      enrolled: true,
      student: {
        id: student.id,
        studentNo: student.studentNo,
        lastName: student.lastName,
        firstName: student.firstName,
        lastNameKana: student.lastNameKana,
        firstNameKana: student.firstNameKana,
        status: student.status,
        enrolledAt: student.enrolledAt,
        school: student.school,
        class: classData ? { id: classData.id, name: classData.name, course: classData.course } : null,
      },
      timetable: classData?.timetables?.[0]?.slots || [],
      ...extra,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "データ取得に失敗しました" }, { status: 500 });
  }
});

// POST: 欠席届・証明書申請
export const POST = withTenant(async (request: NextRequest) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`portal-post:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "アクセスが多すぎます" }, { status: 429 });
  }
  try {
    const body = await request.json();
    const { applicationNo, studentNo, email, action } = body;
    if (!email) return NextResponse.json({ error: "認証情報が必要です" }, { status: 400 });

    const db = getTenantDb();
    let student;
    if (studentNo) {
      student = await db.student.findFirst({ where: { studentNo, email } });
    } else if (applicationNo) {
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
      student = await db.student.findFirst({ where: { applicationId: ownership.applicationId } });
    }

    if (!student) return NextResponse.json({ error: "在籍情報が見つかりません" }, { status: 404 });

    if (action === "leave_request") {
      const { type, startDate, endDate, reason, proofFilePath } = body;
      if (!type || !startDate || !endDate || !reason) {
        return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
      }
      const leave = await db.leaveRequest.create({
        data: { id: crypto.randomUUID(), studentId: student.id, type, startDate, endDate, reason, status: "申請中",
          proofFilePath: proofFilePath || null, updatedAt: new Date() },
      });
      return NextResponse.json({ success: true, leave });
    }

    if (action === "cert_request") {
      const { type, purpose, copies } = body;
      if (!type) return NextResponse.json({ error: "証明書種別が必要です" }, { status: 400 });
      const cert = await db.certificateRequest.create({
        data: { id: crypto.randomUUID(), studentId: student.id, type, purpose: purpose || null, copies: copies || 1, status: "申請中", updatedAt: new Date() },
      });
      return NextResponse.json({ success: true, cert });
    }

    return NextResponse.json({ error: "不明なアクション" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }
});
