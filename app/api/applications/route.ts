import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateApplicationNo, buildApplicationNo } from "@/lib/utils";
import { getSession, isAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { ApplicationCreateSchema } from "@/lib/schemas";
import { ENV } from "@/lib/env";

// 学生へ出願番号確認メール送信
async function sendStudentConfirmation(application: {
  applicationNo: string;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: string;
  nationality: string;
  postalCode: string;
  prefecture: string;
  city: string;
  address: string;
  addressDetail?: string | null;
  residenceStatus?: string | null;
  residenceExpiry?: string | null;
  japaneseLevel: string;
  jlptCertified: boolean;
  schoolName: string;
  department: string;
  course?: string | null;
  enrollmentYear: string;
  enrollmentMonth: string;
  applicationReason: string;
  lastSchoolName: string;
  lastSchoolCountry: string;
  lastSchoolGraduate: string;
  workExperience?: string | null;
}) {
  const baseUrl = ENV.PUBLIC_BASE_URL || "http://localhost:3000";
  const subject = `【出願番号発行のお知らせ】${application.applicationNo}`;
  const body = `${application.lastName} ${application.firstName} 様

この度はご出願いただき、誠にありがとうございます。
以下の通り、出願番号が発行されました。

━━━━━━━━━━━━━━━━━━━━━━━━━━
　出願番号：${application.applicationNo}
━━━━━━━━━━━━━━━━━━━━━━━━━━

この番号は書類アップロード・選考料のお支払い時に必要です。
大切に保管してください。

## ご出願内容

【個人情報】
- 氏名：${application.lastName} ${application.firstName}（${application.lastNameKana} ${application.firstNameKana}）
- 生年月日：${application.birthDate}
- 性別：${application.gender}
- 国籍：${application.nationality}
- 電話番号：${application.phone}
- メールアドレス：${application.email}

【住所】
- 〒${application.postalCode} ${application.prefecture}${application.city}${application.address}${application.addressDetail ? " " + application.addressDetail : ""}

【在日情報】
- 在留資格：${application.residenceStatus || "未記入"}
- 在留期限：${application.residenceExpiry || "未記入"}
- 日本語レベル：${application.japaneseLevel}
- JLPT合格：${application.jlptCertified ? "あり" : "なし"}

【志望校情報】
- 志望校：${application.schoolName}
- 志望学科：${application.department}${application.course ? "（" + application.course + "）" : ""}
- 入学希望：${application.enrollmentYear}年${application.enrollmentMonth}月

【志望動機】
${application.applicationReason}

【学歴】
- 最終学校：${application.lastSchoolName}（${application.lastSchoolCountry}）
- 卒業状況：${application.lastSchoolGraduate}
${application.workExperience ? "- 職務経歴：" + application.workExperience : ""}

## 次のステップ

書類アップロードと選考料のお支払いは、以下のURLから続きを行えます：
${baseUrl}/apply/status

出願番号（${application.applicationNo}）とご登録のメールアドレスでログインしてください。

ご不明な点がございましたら、お気軽にお問い合わせください。

━━━━━━━━━━━━━━━━━━━━━━━━━━
このメールは出願システムより自動送信されました。
━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  try {
    const apiKey = ENV.RESEND_API_KEY;
    const from = ENV.RESEND_FROM || "出願システム <onboarding@resend.dev>";
    if (!apiKey) throw new Error("RESEND_API_KEY not set");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: application.email,
        subject,
        text: body,
      }),
    });
    const data = await res.json() as { id?: string; message?: string };
    if (!res.ok) throw new Error(data.message || "Resend API error");
    console.log(`学生メール送信完了: ${application.email} id=${data.id}`);
  } catch (err) {
    console.error("学生メール送信エラー:", err);
  }
}

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
  const adminEmail = ENV.ADMIN_EMAIL;
  if (!adminEmail) return;
  const subject = `【新規出願】${application.applicationNo}　${application.lastName}${application.firstName}様`;
  const baseUrl = ENV.PUBLIC_BASE_URL || "http://localhost:3000";
  const body = `${application.lastName} ${application.firstName} 様より新規出願を受け付けました。

━━━━━━━━━━━━━━━━━━━━━━━━━━
申請番号：${application.applicationNo}
━━━━━━━━━━━━━━━━━━━━━━━━━━

氏名：${application.lastName} ${application.firstName}
メール：${application.email}
志望校：${application.schoolName}
志望学科：${application.department}
国籍：${application.nationality}
日本語レベル：${application.japaneseLevel}
入学希望：${application.enrollmentYear}年${application.enrollmentMonth}月

管理画面で詳細をご確認ください：
${baseUrl}/admin

---
このメールは出願システムより自動送信されました。`;

  try {
    const apiKey = ENV.RESEND_API_KEY;
    const from = ENV.RESEND_FROM || "出願システム <onboarding@resend.dev>";
    if (!apiKey) throw new Error("RESEND_API_KEY not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: adminEmail, subject, text: body }),
    });
    const data = await res.json() as { id?: string; message?: string };
    if (!res.ok) throw new Error(data.message || "Resend API error");
    console.log(`管理者メール送信完了: ${adminEmail} id=${data.id}`);
  } catch (err) {
    console.error("管理者メール送信エラー:", err);
  }
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
    const todayOnly = searchParams.get("todayOnly") === "1";

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;
    if (nationality) where.nationality = { contains: nationality };
    if (japaneseLevel && japaneseLevel !== "all") where.japaneseLevel = japaneseLevel;
    if (agentId === "none") where.agentId = null;
    else if (agentId && agentId !== "all") where.agentId = agentId;
    if (cohortId === "none") where.cohortId = null;
    else if (cohortId && cohortId !== "all") where.cohortId = cohortId;
    if (todayOnly) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      where.createdAt = { gte: todayStart };
    }
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
  const ip = getClientIp(request);
  if (!checkRateLimit(`apply:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "申請の送信が多すぎます。しばらく後に再試行してください" }, { status: 429 });
  }
  try {
    const parsed = ApplicationCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

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

    // Allow partial submissions with status '書類待ち' (from apply flow Step 2 → Step 3)
    const submittedStatus = body.status === "書類待ち" ? "書類待ち" : "受付中";

    const application = await prisma.application.create({
      data: {
        id: require("crypto").randomUUID(),
        applicationNo,
        cohortId,
        status: submittedStatus,
        updatedAt: new Date(),
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
        priorAttendanceRate: body.priorAttendanceRate || null,
        workExperience: body.workExperience || null,
        examMode: body.examMode || "一般",
        referrerName: body.referrerName || null,
        referrerType: body.referrerType || null,
        // 第一志望を ApplicationSchool に記録
        applicationSchools: {
          create: [
            {
              id: require("crypto").randomUUID(),
              priority: 1,
              schoolName: body.schoolName,
              department: body.department,
              course: body.course || null,
              enrollmentYear: body.enrollmentYear,
              enrollmentMonth: body.enrollmentMonth,
              updatedAt: new Date(),
            },
            // 並願校
            ...((body.additionalSchools ?? []) as Array<{
              schoolName: string; department: string; course?: string;
            }>).map((s, idx) => ({
              id: require("crypto").randomUUID(),
              priority: idx + 2,
              schoolName: s.schoolName,
              department: s.department,
              course: s.course || null,
              enrollmentYear: body.enrollmentYear,
              enrollmentMonth: body.enrollmentMonth,
              updatedAt: new Date(),
            })),
          ],
        },
      },
    });

    // 管理者へメール通知（非同期・失敗しても無視）
    void sendAdminNotification(application).catch(() => {});

    // 学生へ出願番号確認メール送信（非同期・失敗しても無視）
    void sendStudentConfirmation(application).catch(() => {});

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
