import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/logger";

/**
 * 全体日程表（試験スケジュール）CSV エクスポート
 *
 * 1 行 = 1 試験スロット（志望校×試験種別）。
 * 例：第1〜第3志望をそれぞれ 筆記＋面接 で持っている学生は最大 6 行。
 *
 * クエリパラメータ（任意）:
 *  - dateFrom=YYYY-MM-DD      この日付以降の試験のみ
 *  - dateTo=YYYY-MM-DD        この日付以前の試験のみ
 *  - status=面接待ち           Application.status で絞り込み
 *  - examType=written|interview 種別で絞り込み
 *  - includeExempted=1        免除レコードも出力（既定: 含めない）
 *
 * Excel で開けるよう UTF-8 BOM 付き CSV を返す。
 */

const HEADERS = [
  "申請番号",
  "申請者氏名",
  "氏名カナ",
  "メールアドレス",
  "電話番号",
  "志望順位",
  "志望校",
  "学科",
  "コース",
  "入学年度",
  "入学月",
  "試験種別",
  "試験日",
  "時刻",
  "会場",
  "備考",
  "申請ステータス",
  "合否結果",
  "選考区分",
];

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  // 引用符・カンマ・改行が含まれる場合は二重引用符で囲み、内部の " は "" にエスケープ
  if (/["\n,\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsv(row: Record<string, unknown>): string {
  return HEADERS.map((h) => csvEscape(row[h])).join(",");
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const statusFilter = searchParams.get("status");
    const examTypeFilter = searchParams.get("examType"); // 'written' | 'interview'
    const includeExempted = searchParams.get("includeExempted") === "1";

    // 試験日が設定されているスロットを持つ申請を取得（per-school と Application-level の両方をスキャン）
    const applications = await prisma.application.findMany({
      where: statusFilter ? { status: statusFilter, deletedAt: null } : { deletedAt: null },
      orderBy: [{ createdAt: "asc" }],
      include: {
        applicationSchools: {
          orderBy: { priority: "asc" },
        },
      },
    });

    const rows: Record<string, unknown>[] = [];

    for (const app of applications) {
      const fullName = `${app.lastName} ${app.firstName}`;
      const fullNameKana = `${app.lastNameKana} ${app.firstNameKana}`;
      const schools = app.applicationSchools.length > 0
        ? app.applicationSchools
        : [{
            id: "legacy",
            priority: 1,
            schoolName: app.schoolName,
            department: app.department,
            course: app.course,
            enrollmentYear: app.enrollmentYear,
            enrollmentMonth: app.enrollmentMonth,
            result: null as string | null,
            interviewDate: app.interviewDate,
            interviewTime: app.interviewTime,
            interviewPlace: app.interviewPlace,
            interviewNotes: app.interviewNotes,
            writtenExamDate: null as string | null,
            writtenExamTime: null as string | null,
            writtenExamPlace: null as string | null,
            writtenExamNotes: null as string | null,
            writtenExamExempted: false,
          }];

      for (const s of schools) {
        const priorityLabel = ["第1志望", "第2志望", "第3志望"][s.priority - 1] || `第${s.priority}志望`;

        // 第1志望は Application-level の interview にフォールバック
        const isP1 = s.priority === 1;
        const interviewDate  = s.interviewDate  || (isP1 ? app.interviewDate  : null);
        const interviewTime  = s.interviewTime  || (isP1 ? app.interviewTime  : null);
        const interviewPlace = s.interviewPlace || (isP1 ? app.interviewPlace : null);
        const interviewNotes = s.interviewNotes || (isP1 ? app.interviewNotes : null);

        const inRange = (d: string | null) => {
          if (!d) return false;
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        };

        // 筆記試験スロット
        const wantWritten = examTypeFilter !== "interview";
        if (wantWritten) {
          if (s.writtenExamExempted) {
            if (includeExempted) {
              rows.push({
                "申請番号": app.applicationNo,
                "申請者氏名": fullName,
                "氏名カナ": fullNameKana,
                "メールアドレス": app.email,
                "電話番号": app.phone,
                "志望順位": priorityLabel,
                "志望校": s.schoolName,
                "学科": s.department,
                "コース": s.course || "",
                "入学年度": s.enrollmentYear,
                "入学月": s.enrollmentMonth,
                "試験種別": "筆記試験（免除）",
                "試験日": "",
                "時刻": "",
                "会場": "",
                "備考": "",
                "申請ステータス": app.status,
                "合否結果": s.result || "",
                "選考区分": app.examMode || "",
              });
            }
          } else if (s.writtenExamDate || s.writtenExamTime || s.writtenExamPlace) {
            // 日付フィルタ通過 OR 日付未設定（時刻のみ）
            if (!dateFrom && !dateTo ? true : inRange(s.writtenExamDate)) {
              rows.push({
                "申請番号": app.applicationNo,
                "申請者氏名": fullName,
                "氏名カナ": fullNameKana,
                "メールアドレス": app.email,
                "電話番号": app.phone,
                "志望順位": priorityLabel,
                "志望校": s.schoolName,
                "学科": s.department,
                "コース": s.course || "",
                "入学年度": s.enrollmentYear,
                "入学月": s.enrollmentMonth,
                "試験種別": "筆記試験",
                "試験日": s.writtenExamDate || "",
                "時刻": s.writtenExamTime || "",
                "会場": s.writtenExamPlace || "",
                "備考": s.writtenExamNotes || "",
                "申請ステータス": app.status,
                "合否結果": s.result || "",
                "選考区分": app.examMode || "",
              });
            }
          }
        }

        // 面接試験スロット
        const wantInterview = examTypeFilter !== "written";
        if (wantInterview && (interviewDate || interviewTime || interviewPlace)) {
          if (!dateFrom && !dateTo ? true : inRange(interviewDate)) {
            rows.push({
              "申請番号": app.applicationNo,
              "申請者氏名": fullName,
              "氏名カナ": fullNameKana,
              "メールアドレス": app.email,
              "電話番号": app.phone,
              "志望順位": priorityLabel,
              "志望校": s.schoolName,
              "学科": s.department,
              "コース": s.course || "",
              "入学年度": s.enrollmentYear,
              "入学月": s.enrollmentMonth,
              "試験種別": "面接試験",
              "試験日": interviewDate || "",
              "時刻": interviewTime || "",
              "会場": interviewPlace || "",
              "備考": interviewNotes || "",
              "申請ステータス": app.status,
              "合否結果": s.result || "",
              "選考区分": app.examMode || "",
            });
          }
        }
      }
    }

    // 試験日 → 時刻 → 申請番号 でソート（時系列表示）
    rows.sort((a, b) => {
      const ad = (a["試験日"] as string) || "9999-99-99";
      const bd = (b["試験日"] as string) || "9999-99-99";
      if (ad !== bd) return ad.localeCompare(bd);
      const at = (a["時刻"] as string) || "99:99";
      const bt = (b["時刻"] as string) || "99:99";
      if (at !== bt) return at.localeCompare(bt);
      return String(a["申請番号"]).localeCompare(String(b["申請番号"]));
    });

    // CSV 生成（UTF-8 BOM 付き = Excel が文字化けしない）
    const csv = "﻿" + [HEADERS.join(","), ...rows.map(rowToCsv)].join("\r\n");

    const tag = new Date().toISOString().slice(0, 10);
    const fileName = `試験日程表_${tag}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logError("GET /api/admin/schedule/export", e);
    return NextResponse.json({ error: "エクスポートに失敗しました" }, { status: 500 });
  }
}
