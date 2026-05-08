import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateApplicationNo, buildApplicationNo } from "@/lib/utils";
import { exec } from "child_process";
import { getSession, isAdmin, checkRateLimit } from "@/lib/auth";

// 管理者へメール通知
async function sendAdminNotification(application: {
  applicationNo: string;
  lastName: string;
  firstName: string;
  email: string;
  schoolName: string;
  department: string;
  nationality: string;
  japaneseLevel: string;
  enrollmentYear: string;
  enrollmentMonth: string;
}) {
  const adminEmail = process.env.ADMIN_EMAIL || "xueweixuan@chinichi.com";
  const subject = `【新規出願】${application.applicationNo}　${application.lastName}${application.firstName}様`;
  const body = `## 新規出願のお知らせ

以下の出願を受け付けました。

| 項目 | 内容 |
|------|------|
| 申請番号 | ${application.applicationNo} |
| 氏名 | ${application.lastName} ${application.firstName} |
| メールアドレス | ${application.email} |
| 志望校 | ${application.schoolName} |
| 志望学科 | ${application.department} |
| 国籍 | ${application.nationality} |
| 日本語レベル | ${application.japaneseLevel} |
| 入学希望 | ${application.enrollmentYear}年${application.enrollmentMonth}月 |

管理画面で詳細をご確認ください：
http://20.112.84.17:3000/admin

---
このメールは出願システムより自動送信されました。`;

  return new Promise<void>((resolve) => {
    const cmd = `gsk vm_email send ${adminEmail} -s "${subject.replace(/"/g, '\\"')}" -b "${body.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
    exec(cmd, { timeout: 30000 }, (err) => {
      if (err) console.error("管理者メール送信エラー:", err.message);
      resolve();
    });
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const nationality = searchParams.get("nationality");
    const japaneseLevel = searchParams.get("japaneseLevel");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Admin auth check
    const session = await getSession(request);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const agentId = searchParams.get("agentId");
    const cohortId = searchParams.get("cohortId");

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;
    if (nationality) where.nationality = { contains: nationality };
    if (japaneseLevel && japaneseLevel !== "all") where.japaneseLevel = japaneseLevel;
    if (agentId === "none") where.agentId = null;
    else if (agentId && agentId !== "all") where.agentId = agentId;
    if (cohortId === "none") where.cohortId = null;
    else if (cohortId && cohortId !== "all") where.cohortId = cohortId;
    if (search) {
      where.OR = [
        { lastName: { contains: search } },
        { firstName: { contains: search } },
        { lastNameKana: { contains: search } },
        { firstNameKana: { contains: search } },
        { applicationNo: { contains: search } },
        { email: { contains: search } },
        { schoolName: { contains: search } },
      ];
    }

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          documents: {
            select: { id: true, docType: true, fileName: true },
          },
          agent: {
            select: { id: true, name: true, country: true },
          },
          cohort: {
            select: { id: true, name: true },
          },
          enrollmentProcedure: {
            select: { status: true, schoolConfirmed: true, admitLetterIssued: true },
          },
          applicationSchools: {
            orderBy: { priority: "asc" },
          },
        },
      }),
      prisma.application.count({ where }),
    ]);

    return NextResponse.json({
      applications,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/applications error:", error);
    return NextResponse.json(
      { error: "申請一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // レートリミット（IP単位: 1時間5件まで）
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(`apply:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "申請の送信が多すぎます。しばらく後に再試行してください" }, { status: 429 });
  }
  try {
    const body = await request.json();

    // Required fields validation
    const required = [
      "lastName",
      "firstName",
      "lastNameKana",
      "firstNameKana",
      "birthDate",
      "gender",
      "nationality",
      "phone",
      "email",
      "postalCode",
      "prefecture",
      "city",
      "address",
      "japaneseLevel",
      "schoolName",
      "department",
      "enrollmentYear",
      "enrollmentMonth",
      "applicationReason",
      "lastSchoolName",
      "lastSchoolCountry",
      "lastSchoolGraduate",
    ];

    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `${field} は必須項目です` },
          { status: 400 }
        );
      }
    }

    // デフォルトバッチを取得して申請番号を採番
    let applicationNo: string;
    let cohortId: string | null = null;

    const defaultCohort = await prisma.cohort.findFirst({
      where: { isDefault: true },
    });

    if (defaultCohort) {
      // バッチのseqCounterをインクリメント（競合防止のためトランザクション）
      const updated = await prisma.cohort.update({
        where: { id: defaultCohort.id },
        data: { seqCounter: { increment: 1 } },
      });
      applicationNo = buildApplicationNo(updated.year, updated.round, updated.seqCounter);
      cohortId = defaultCohort.id;
    } else {
      // バッチ未設定の場合は旧形式にフォールバック
      applicationNo = generateApplicationNo();
    }

    const application = await prisma.application.create({
      data: {
        applicationNo,
        cohortId,
        status: "受付中",
        lastName: body.lastName,
        firstName: body.firstName,
        lastNameKana: body.lastNameKana,
        firstNameKana: body.firstNameKana,
        birthDate: body.birthDate,
        gender: body.gender,
        nationality: body.nationality,
        phone: body.phone,
        email: body.email,
        postalCode: body.postalCode,
        prefecture: body.prefecture,
        city: body.city,
        address: body.address,
        addressDetail: body.addressDetail || null,
        residenceStatus: body.residenceStatus || null,
        residenceExpiry: body.residenceExpiry || null,
        japaneseLevel: body.japaneseLevel,
        jlptCertified: body.jlptCertified || false,
        schoolName: body.schoolName,
        department: body.department,
        course: body.course || null,
        enrollmentYear: body.enrollmentYear,
        enrollmentMonth: body.enrollmentMonth,
        applicationReason: body.applicationReason,
        lastSchoolName: body.lastSchoolName,
        lastSchoolCountry: body.lastSchoolCountry,
        lastSchoolGraduate: body.lastSchoolGraduate,
        workExperience: body.workExperience || null,
        examMode: body.examMode || "一般",
        referrerName: body.referrerName || null,
        referrerType: body.referrerType || null,
      },
    });

    // 管理者へメール通知（非同期・失敗しても無視）
    void sendAdminNotification(application).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        applicationNo: application.applicationNo,
        id: application.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/applications error:", error);
    return NextResponse.json(
      { error: "申請の提出に失敗しました。もう一度お試しください。" },
      { status: 500 }
    );
  }
}
