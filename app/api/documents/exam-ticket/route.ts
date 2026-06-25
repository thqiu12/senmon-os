import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyStudentOwnership } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { generateExamTicketPDF } from "@/lib/pdf/exam-ticket";
import { examModesForConfig, examModeLabel } from "@/lib/applyExamModes";
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
    // 併願対応: 志望校ごとに受験票発行できるよう priority (1/2/3) または schoolId を受け取る。
    // 省略時は第1志望（priority=1）が選ばれる（後方互換）。
    const schoolIdParam = searchParams.get("schoolId");
    const priorityParamRaw = searchParams.get("priority");
    const priorityParam = priorityParamRaw ? parseInt(priorityParamRaw, 10) : null;

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
        applicationSchools: {
          orderBy: { priority: "asc" },
        },
        applySchool: { select: { schoolKey: true } },
      },
    });
    if (!app) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    // 対象 ApplicationSchool を決定
    let targetSchool = null as (typeof app.applicationSchools)[number] | null;
    if (schoolIdParam) {
      targetSchool = app.applicationSchools.find((s) => s.id === schoolIdParam) ?? null;
      if (!targetSchool) {
        return NextResponse.json({ error: "指定された志望校が見つかりません" }, { status: 404 });
      }
    } else if (priorityParam) {
      targetSchool = app.applicationSchools.find((s) => s.priority === priorityParam) ?? null;
      // priority 指定で該当無し → 法的にエラー（ただし priority=1 で legacy 単一志望ならフォールバック）
      if (!targetSchool && priorityParam !== 1) {
        return NextResponse.json({ error: "指定された志望順位の志望校が見つかりません" }, { status: 404 });
      }
    } else {
      // 省略時: 第1志望
      targetSchool = app.applicationSchools.find((s) => s.priority === 1) ?? null;
    }

    // 表示用フィールドを志望校別 → Application-level の順にフォールバック
    // 第1志望は Application-level の interviewDate を継承（共通設定）
    const isPriority1 = !targetSchool || targetSchool.priority === 1;
    const schoolName       = targetSchool?.schoolName       ?? app.schoolName;
    const department       = targetSchool?.department       ?? app.department;
    const course           = targetSchool?.course           ?? app.course ?? "";
    const enrollmentYear   = targetSchool?.enrollmentYear   ?? app.enrollmentYear;
    const enrollmentMonth  = targetSchool?.enrollmentMonth  ?? app.enrollmentMonth;
    const interviewDate    = targetSchool?.interviewDate    ?? (isPriority1 ? app.interviewDate    : null);
    const interviewTime    = targetSchool?.interviewTime    ?? (isPriority1 ? app.interviewTime    : null);
    const interviewPlace   = targetSchool?.interviewPlace   ?? (isPriority1 ? app.interviewPlace   : null);
    const interviewNotes   = targetSchool?.interviewNotes   ?? (isPriority1 ? app.interviewNotes   : null);
    // 筆記試験は per-school のみ（Application-level に持たせない）
    const writtenExamDate     = targetSchool?.writtenExamDate     ?? null;
    const writtenExamTime     = targetSchool?.writtenExamTime     ?? null;
    const writtenExamPlace    = targetSchool?.writtenExamPlace    ?? null;
    const writtenExamNotes    = targetSchool?.writtenExamNotes    ?? null;
    const writtenExamExempted = targetSchool?.writtenExamExempted ?? false;
    const priorityLabel    = targetSchool ? (["第1志望", "第2志望", "第3志望"][targetSchool.priority - 1] || `第${targetSchool.priority}志望`) : null;

    // 受験票発行条件:
    //   ① ステータスが「面接待ち」（書類審査通過の管理者シグナル）
    //   ② 面接試験 OR 筆記試験のいずれか日程が確定している
    //   ③ 差し戻し中の書類がない
    const isReady = app.status === "面接待ち";
    const hasInterviewSlot = !!interviewDate;
    const hasWrittenSlot   = writtenExamExempted || !!writtenExamDate;
    const hasAnySlot       = hasInterviewSlot || hasWrittenSlot;
    const hasRejection = app.documents.some((d) => d.status === "差し戻し");

    if (!isReady) {
      return NextResponse.json(
        { error: "書類審査通過後にダウンロードできます。" },
        { status: 403 },
      );
    }
    if (!hasAnySlot) {
      return NextResponse.json(
        { error: `${priorityLabel ? priorityLabel + "の" : ""}試験日程が確定するまでお待ちください。` },
        { status: 403 },
      );
    }
    if (hasRejection) {
      return NextResponse.json(
        { error: "差し戻された書類があります。再提出後に発行可能になります。" },
        { status: 403 },
      );
    }

    // 写真: 最新の証明写真。優先順は 確認済 > 提出済 で、差し戻し済みは除外。
    // docType の表記ゆれ（「証明写真」「証明写真（3×3cm）」等）に対応するため部分一致で判定。
    const photoDocs = app.documents.filter(
      (d) => d.docType.includes("証明写真") && d.status !== "差し戻し",
    );
    const photoDoc =
      photoDocs.find((d) => d.status === "確認済") ?? photoDocs[0] ?? null;

    const issueDate = new Date().toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric",
    });

    // 選考区分（examMode）は保存値=内部ID（既定の "一般" 等、またはカスタムの "em_xxxx"）。
    // 受験票には学校×タイプの区分配置から解決した「表示名(label)」を印字する。
    // 設定が取れない/未知の id の場合 examModeLabel は id をそのまま返す（後方互換のフォールバック）。
    // 設定取得の失敗で PDF 生成を壊さないよう、丸ごと try/catch で raw examMode に退避する。
    const rawExamMode = app.examMode || "一般";
    let examModeDisplay = rawExamMode;
    try {
      const schoolKey = app.applySchool?.schoolKey ?? null;
      if (schoolKey) {
        const rows = await prisma.formFieldConfig.findMany({
          where: {
            fieldKey: "examMode",
            schoolId: schoolKey,
            OR: [{ applicantType: null }, { applicantType: app.applicantType }],
          },
          select: { fieldKey: true, isEnabled: true, options: true },
        });
        if (rows.length > 0) {
          const opts = examModesForConfig(rows);
          examModeDisplay = examModeLabel(opts, rawExamMode);
        }
      }
    } catch (e) {
      logError("GET /api/documents/exam-ticket: examMode label resolve", e);
      examModeDisplay = rawExamMode;
    }

    const pdfBuffer = await generateExamTicketPDF({
      applicationNo: app.applicationNo,
      applicantName: `${app.lastName} ${app.firstName}`,
      applicantNameKana: `${app.lastNameKana} ${app.firstNameKana}`,
      nationality: app.nationality,
      birthDate: app.birthDate,
      gender: app.gender,
      schoolName,
      department,
      course,
      enrollmentYear,
      enrollmentMonth,
      examMode: examModeDisplay,
      interviewDate,
      interviewTime,
      interviewPlace,
      interviewNotes,
      writtenExamDate,
      writtenExamTime,
      writtenExamPlace,
      writtenExamNotes,
      writtenExamExempted,
      photoFilePath: photoDoc?.filePath ?? null,
      issueDate,
      priorityLabel,
    });

    // ファイル名にも志望順位を入れて、複数 PDF を保存しても判別できるように
    const priorityTag = priorityLabel ? `_${priorityLabel}` : "";
    const fileName = `受験票_${applicationNo}${priorityTag}.pdf`;
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
