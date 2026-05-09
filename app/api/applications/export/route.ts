import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeCsv, formatDateTimeJP } from "@/lib/utils";
import { getSession, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  try {
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;

    const applications = await prisma.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        documents: {
          select: { docType: true },
        },
        interviewFeedbacks: {
          select: { scoreOverall: true, recommendation: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        enrollmentProcedure: {
          select: {
            status: true,
            tuitionPaidAt: true,
            schoolConfirmed: true,
            admitLetterIssued: true,
          },
        },
        agent: {
          select: { name: true },
        },
      },
    });

    // CSVヘッダー
    const headers = [
      "申請番号",
      "状態",
      "申請日時",
      "姓",
      "名",
      "姓（カナ）",
      "名（カナ）",
      "生年月日",
      "性別",
      "国籍",
      "電話番号",
      "メールアドレス",
      "郵便番号",
      "都道府県",
      "市区町村",
      "住所",
      "住所詳細",
      "在留資格",
      "在留期限",
      "日本語レベル",
      "JLPT取得",
      "志望校",
      "志望学科",
      "志望コース",
      "入学希望年",
      "入学希望月",
      "志望動機",
      "最終学歴（学校名）",
      "最終学歴（国）",
      "卒業状況",
      "職務経歴",
      "提出書類",
      "面接総合スコア",
      "面接推薦",
      "入学手続きステータス",
      "学費振込",
      "学校承認",
      "許可書発行",
      "エージェント名",
    ];

    const rows = applications.map((app) => {
      const docTypes = app.documents.map((d) => d.docType).join("／");

      // 面接スコア平均
      const feedbacks = app.interviewFeedbacks ?? [];
      const scoresWithValue = feedbacks.filter(f => f.scoreOverall !== null);
      const avgScore = scoresWithValue.length > 0
        ? (scoresWithValue.reduce((s, f) => s + (f.scoreOverall ?? 0), 0) / scoresWithValue.length).toFixed(1)
        : "";
      // 最新の推薦
      const latestRecommendation = feedbacks.length > 0 ? (feedbacks[0].recommendation ?? "") : "";

      // 入学手続き
      const ep = app.enrollmentProcedure;
      const epStatus = ep?.status ?? "";
      const tuitionPaid = ep ? (ep.tuitionPaidAt ? "振込済" : "未振込") : "";
      const schoolConfirmed = ep ? (ep.schoolConfirmed ? "承認済" : "未") : "";
      const admitLetterIssued = ep ? (ep.admitLetterIssued ? "発行済" : "未") : "";

      // エージェント
      const agentName = app.agent?.name ?? "";

      return [
        escapeCsv(app.applicationNo),
        escapeCsv(app.status),
        escapeCsv(formatDateTimeJP(app.createdAt)),
        escapeCsv(app.lastName),
        escapeCsv(app.firstName),
        escapeCsv(app.lastNameKana),
        escapeCsv(app.firstNameKana),
        escapeCsv(app.birthDate),
        escapeCsv(app.gender),
        escapeCsv(app.nationality),
        escapeCsv(app.phone),
        escapeCsv(app.email),
        escapeCsv(app.postalCode),
        escapeCsv(app.prefecture),
        escapeCsv(app.city),
        escapeCsv(app.address),
        escapeCsv(app.addressDetail || ""),
        escapeCsv(app.residenceStatus || ""),
        escapeCsv(app.residenceExpiry || ""),
        escapeCsv(app.japaneseLevel),
        escapeCsv(app.jlptCertified ? "あり" : "なし"),
        escapeCsv(app.schoolName),
        escapeCsv(app.department),
        escapeCsv(app.course || ""),
        escapeCsv(app.enrollmentYear),
        escapeCsv(app.enrollmentMonth),
        escapeCsv(app.applicationReason),
        escapeCsv(app.lastSchoolName),
        escapeCsv(app.lastSchoolCountry),
        escapeCsv(app.lastSchoolGraduate),
        escapeCsv(app.workExperience || ""),
        escapeCsv(docTypes),
        escapeCsv(avgScore),
        escapeCsv(latestRecommendation),
        escapeCsv(epStatus),
        escapeCsv(tuitionPaid),
        escapeCsv(schoolConfirmed),
        escapeCsv(admitLetterIssued),
        escapeCsv(agentName),
      ].join(",");
    });

    // BOM付きUTF-8でExcelでも文字化けしないように
    const bom = "\uFEFF";
    const csv = bom + headers.join(",") + "\n" + rows.join("\n");

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="applications_${dateStr}.csv"`,
      },
    });
  } catch (error) {
    console.error("GET /api/applications/export error:", error);
    return NextResponse.json(
      { error: "CSVエクスポートに失敗しました" },
      { status: 500 }
    );
  }
}
