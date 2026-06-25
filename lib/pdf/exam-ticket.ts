import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { escapeHtml } from "@/lib/security";
import { ENV } from "@/lib/env";
import { schoolSealHtml } from "@/lib/pdf/seal";

// 受験票内アイコン（ストロークSVG・絵文字の代替）。currentColor で見出し色を継承。
const ICON_WRITTEN =
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
const ICON_INTERVIEW =
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>`;

export interface ExamTicketData {
  applicationNo: string;
  applicantName: string;
  applicantNameKana: string;
  nationality: string;
  birthDate: string;
  gender: string;
  schoolName: string;
  department: string;
  course: string;
  enrollmentYear: string;
  enrollmentMonth: string;
  examMode: string; // 表示名(label)を渡すこと（保存値の内部IDではなく。呼び出し側で解決済み）
  // 面接試験
  interviewDate: string | null;
  interviewTime: string | null;
  interviewPlace: string | null;
  interviewNotes: string | null;
  // 筆記試験
  writtenExamDate?: string | null;
  writtenExamTime?: string | null;
  writtenExamPlace?: string | null;
  writtenExamNotes?: string | null;
  writtenExamExempted?: boolean;
  // /uploads/<applicationId>/<filename>.png 等
  photoFilePath: string | null;
  issueDate: string;
  /** 第1志望 / 第2志望 / 第3志望（併願時のみ）。null なら chip 非表示。 */
  priorityLabel?: string | null;
}

function uploadRoot(): string {
  return path.isAbsolute(ENV.UPLOAD_DIR) ? ENV.UPLOAD_DIR : path.join(process.cwd(), ENV.UPLOAD_DIR);
}

function readPhotoAsDataUri(photoFilePath: string | null): string | null {
  if (!photoFilePath) return null;
  // photoFilePath は "/uploads/<appId>/<filename>" の形式
  const m = photoFilePath.match(/^\/uploads\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const fullPath = path.join(uploadRoot(), m[1], m[2]);
  if (!existsSync(fullPath)) return null;
  try {
    const buf = readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase().replace(".", "");
    const mime = ext === "png" ? "image/png"
               : ext === "webp" ? "image/webp"
               : ext === "pdf" ? null
               : "image/jpeg";
    if (!mime) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function buildHTML(data: ExamTicketData): string {
  const e = escapeHtml;
  const photoUri = readPhotoAsDataUri(data.photoFilePath);
  // 選考事務局の受付印（角印）
  const recvSeal = schoolSealHtml(data.schoolName, "選考事務局印", { size: 58, rows: 3, rotate: -5 });

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Noto Sans JP', 'Yu Gothic', 'Hiragino Sans', sans-serif;
    background:#fff; color:#111;
    width:794px; min-height:1123px;
  }
  .page { width:794px; min-height:1123px; padding:60px 70px; position:relative; }
  .header { border-bottom:3px solid #1e3a5f; padding-bottom:14px; margin-bottom:28px; display:flex; justify-content:space-between; align-items:flex-end; }
  .doc-title { font-size:32px; font-weight:700; color:#1e3a5f; letter-spacing:8px; }
  .org { font-size:11px; color:#666; text-align:right; line-height:1.6; }
  /* ヘッダー右側：受付角印 ＋ 事務局名を横並び（重なり回避） */
  .header-right { display:flex; align-items:center; gap:16px; }
  .exam-card h2 svg { flex-shrink:0; }
  .grid { display:grid; grid-template-columns:200px 1fr; gap:24px; margin-bottom:32px; }
  .photo-box {
    width:200px; height:240px;
    border:2px solid #1e3a5f;
    display:flex; align-items:center; justify-content:center;
    background:#f8fafc; overflow:hidden;
  }
  .photo-box img { width:100%; height:100%; object-fit:cover; }
  .photo-box .placeholder { color:#999; font-size:11px; text-align:center; padding:8px; }
  .info-table { font-size:13px; }
  .info-row { display:flex; border-bottom:1px solid #e5e7eb; padding:10px 0; }
  .info-label { width:110px; color:#666; font-weight:500; flex-shrink:0; }
  .info-value { flex:1; color:#111; font-weight:600; }
  .appno-box {
    background:#1e3a5f; color:#fff;
    padding:18px 24px; border-radius:6px;
    margin-bottom:24px;
    display:flex; justify-content:space-between; align-items:center;
  }
  .appno-box .label { font-size:12px; opacity:.8; }
  .appno-box .value { font-size:28px; font-weight:700; letter-spacing:3px; }
  .priority-chip {
    display:inline-block;
    background:#fff; color:#1e3a5f;
    font-size:12px; font-weight:700;
    padding:3px 10px; border-radius:999px;
    margin-bottom:4px; letter-spacing:1px;
  }
  .exam-stack { display:flex; flex-direction:column; gap:14px; margin-bottom:24px; }
  .exam-card {
    padding:18px 22px; border-radius:8px;
    border:2px solid; position:relative;
  }
  .exam-card.written  { background:#eff6ff; border-color:#3b82f6; }
  .exam-card.interview { background:#fffbeb; border-color:#f59e0b; }
  .exam-card h2 { font-size:14px; margin-bottom:12px; display:flex; align-items:center; gap:8px; }
  .exam-card.written  h2 { color:#1d4ed8; }
  .exam-card.interview h2 { color:#92400e; }
  .exam-grid { display:grid; grid-template-columns:80px 1fr; gap:8px 16px; font-size:13px; }
  .exam-grid .k { color:#666; }
  .exam-card.written  .exam-grid .k { color:#1e40af; }
  .exam-card.interview .exam-grid .k { color:#78350f; }
  .exam-grid .v { color:#111; font-weight:600; }
  .exam-exempt {
    text-align:center; padding:14px;
    color:#555; font-size:14px; font-weight:600;
    border:2px dashed #cbd5e1; border-radius:6px;
    background:#f8fafc;
  }
  .exam-empty {
    text-align:center; padding:12px;
    color:#888; font-size:12px;
    border:1px dashed #d1d5db; border-radius:6px;
    background:#fafafa;
  }
  .notes {
    margin-top:24px; padding:16px 20px;
    background:#f8fafc; border-left:4px solid #1e3a5f;
    font-size:11px; line-height:1.8; color:#444;
  }
  .footer {
    position:absolute; bottom:50px; left:70px; right:70px;
    border-top:1px solid #ccc; padding-top:12px;
    display:flex; justify-content:space-between;
    font-size:10px; color:#888;
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="doc-title">受　験　票</div>
    <div class="header-right">
      ${recvSeal}
      <div class="org">
        ${e(data.schoolName)}<br>
        入学選考事務局
      </div>
    </div>
  </div>

  <div class="appno-box">
    <div>
      ${data.priorityLabel ? `<div class="priority-chip">${e(data.priorityLabel)}</div>` : ""}
      <div class="label">受験番号</div>
      <div class="value">${e(data.applicationNo)}</div>
    </div>
    <div style="text-align:right;">
      <div class="label">志望区分</div>
      <div class="value" style="font-size:14px;">${e(data.examMode)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="photo-box">
      ${photoUri
        ? `<img src="${photoUri}" alt="証明写真" />`
        : `<div class="placeholder">証明写真<br>3×3cm<br>（未提出）</div>`}
    </div>
    <div class="info-table">
      <div class="info-row"><div class="info-label">氏名</div><div class="info-value">${e(data.applicantName)}</div></div>
      <div class="info-row"><div class="info-label">フリガナ</div><div class="info-value">${e(data.applicantNameKana)}</div></div>
      <div class="info-row"><div class="info-label">生年月日</div><div class="info-value">${e(data.birthDate)}</div></div>
      <div class="info-row"><div class="info-label">性別</div><div class="info-value">${e(data.gender)}</div></div>
      <div class="info-row"><div class="info-label">国籍</div><div class="info-value">${e(data.nationality)}</div></div>
      <div class="info-row"><div class="info-label">志望校</div><div class="info-value">${e(data.schoolName)}</div></div>
      <div class="info-row"><div class="info-label">志望学科</div><div class="info-value">${e(data.department)}${data.course ? ` / ${e(data.course)}` : ""}</div></div>
      <div class="info-row"><div class="info-label">入学年度</div><div class="info-value">${e(data.enrollmentYear)}年${e(data.enrollmentMonth)}月</div></div>
    </div>
  </div>

  <div class="exam-stack">
    <!-- 筆記試験 -->
    <div class="exam-card written">
      <h2>${ICON_WRITTEN} 筆記試験</h2>
      ${data.writtenExamExempted
        ? `<div class="exam-exempt">免　除</div>`
        : (data.writtenExamDate || data.writtenExamTime || data.writtenExamPlace) ? `
      <div class="exam-grid">
        <div class="k">日付</div><div class="v">${e(data.writtenExamDate) || "—"}</div>
        <div class="k">時間</div><div class="v">${e(data.writtenExamTime) || "—"}</div>
        <div class="k">会場</div><div class="v">${e(data.writtenExamPlace) || "—"}</div>
        ${data.writtenExamNotes ? `<div class="k">注意</div><div class="v" style="white-space:pre-line;">${e(data.writtenExamNotes)}</div>` : ""}
      </div>` : `<div class="exam-empty">日程未定</div>`
      }
    </div>

    <!-- 面接試験 -->
    <div class="exam-card interview">
      <h2>${ICON_INTERVIEW} 面接試験</h2>
      ${data.interviewDate || data.interviewTime || data.interviewPlace ? `
      <div class="exam-grid">
        <div class="k">日付</div><div class="v">${e(data.interviewDate) || "—"}</div>
        <div class="k">時間</div><div class="v">${e(data.interviewTime) || "—"}</div>
        <div class="k">会場</div><div class="v">${e(data.interviewPlace) || "—"}</div>
        ${data.interviewNotes ? `<div class="k">注意</div><div class="v" style="white-space:pre-line;">${e(data.interviewNotes)}</div>` : ""}
      </div>` : `<div class="exam-empty">日程未定</div>`}
    </div>
  </div>

  <div class="notes">
    <strong>■ 受験当日の注意事項</strong><br>
    ・本受験票と顔写真付きの身分証明書（在留カード・パスポート等）を必ず持参してください。<br>
    ・試験開始 15 分前までに会場へお越しください。<br>
    ・遅刻された場合、入室をお断りすることがあります。<br>
    ・本受験票はそのまま会場でご提出ください。
  </div>

  <div class="footer">
    <div>発行日: ${e(data.issueDate)}</div>
    <div>※ 本受験票は本人以外の使用を固く禁じます</div>
  </div>
</div>
</body>
</html>`;
}

export async function generateExamTicketPDF(data: ExamTicketData): Promise<Buffer> {
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/local/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean) as string[];
  const executablePath = possiblePaths.find((p) => existsSync(p));
  if (!executablePath) {
    throw new Error("Chromium/Chrome not found. Set PUPPETEER_EXECUTABLE_PATH.");
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildHTML(data), { waitUntil: "domcontentloaded", timeout: 30000 });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
