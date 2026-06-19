import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { escapeCsv, formatDateTimeJP } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { logError } from "@/lib/logger";
import { statusWhere } from "@/lib/schemas";

const HEADERS = [
  "申請番号","状態","申請日時","姓","名","姓（カナ）","名（カナ）","生年月日","性別","国籍",
  "電話番号","メールアドレス","郵便番号","都道府県","市区町村","住所","住所詳細","在留資格",
  "在留期限","日本語レベル","JLPT取得","志望校","志望学科","志望コース","入学希望年","入学希望月",
  "志望動機","最終学歴（学校名）","最終学歴（国）","卒業状況","職務経歴","提出書類","面接総合スコア",
  "面接推薦","入学手続きステータス","学費振込","学校承認","許可書発行","エージェント名",
];

const PAGE_SIZE = 500;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!(await hasCapability(session, "data.export"))) {
    return NextResponse.json({ error: "エクスポートの権限がありません" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const where: Record<string, unknown> = { deletedAt: null };
    const sw = statusWhere(status);
    if (sw !== undefined) where.status = sw;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode("﻿" + HEADERS.join(",") + "\n"));

        const include = {
          documents: { select: { docType: true } },
          interviewFeedbacks: {
            select: { scoreOverall: true, recommendation: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          },
          enrollmentProcedure: {
            select: { status: true, tuitionPaidAt: true, schoolConfirmed: true, admitLetterIssued: true },
          },
          agent: { select: { name: true } },
        } satisfies Prisma.ApplicationInclude;

        let cursor: string | undefined = undefined;
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const batch: Prisma.ApplicationGetPayload<{ include: typeof include }>[] =
              await prisma.application.findMany({
                where,
                orderBy: { id: "asc" },
                take: PAGE_SIZE,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                include,
              });
            if (batch.length === 0) break;

            for (const app of batch) {
              const docTypes = app.documents.map((d) => d.docType).join("／");
              const fbs = app.interviewFeedbacks ?? [];
              const valid = fbs.filter((f) => f.scoreOverall !== null);
              const avg = valid.length > 0
                ? (valid.reduce((s, f) => s + (f.scoreOverall ?? 0), 0) / valid.length).toFixed(1)
                : "";
              const rec = fbs.length > 0 ? (fbs[0].recommendation ?? "") : "";
              const ep = app.enrollmentProcedure;

              const row = [
                app.applicationNo, app.status, formatDateTimeJP(app.createdAt),
                app.lastName, app.firstName, app.lastNameKana, app.firstNameKana,
                app.birthDate, app.gender, app.nationality, app.phone, app.email,
                app.postalCode, app.prefecture, app.city, app.address, app.addressDetail || "",
                app.residenceStatus || "", app.residenceExpiry || "", app.japaneseLevel,
                app.jlptCertified ? "あり" : "なし",
                app.schoolName, app.department, app.course || "",
                app.enrollmentYear, app.enrollmentMonth, app.applicationReason,
                app.lastSchoolName, app.lastSchoolCountry, app.lastSchoolGraduate,
                app.workExperience || "", docTypes, avg, rec,
                ep?.status ?? "",
                ep ? (ep.tuitionPaidAt ? "振込済" : "未振込") : "",
                ep ? (ep.schoolConfirmed ? "承認済" : "未") : "",
                ep ? (ep.admitLetterIssued ? "発行済" : "未") : "",
                app.agent?.name ?? "",
              ].map(escapeCsv).join(",");
              controller.enqueue(enc.encode(row + "\n"));
            }

            cursor = batch[batch.length - 1].id;
            if (batch.length < PAGE_SIZE) break;
          }
          controller.close();
        } catch (e) {
          logError("CSV stream failed", e);
          controller.error(e);
        }
      },
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="applications_${dateStr}.csv"`,
      },
    });
  } catch (error) {
    logError("GET /api/applications/export", error);
    return NextResponse.json({ error: "CSVエクスポートに失敗しました" }, { status: 500 });
  }
}
