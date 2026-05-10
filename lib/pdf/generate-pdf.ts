import puppeteer from "puppeteer-core";
import { existsSync } from "fs";
import { escapeHtml } from "@/lib/security";

export interface AdmissionLetterData {
  type: "admission_notice" | "admission_permit";
  applicationNo: string;
  applicantName: string;
  applicantNameKana: string;
  nationality: string;
  birthDate: string;
  schoolName: string;
  department: string;
  course: string;
  enrollmentYear: string;
  enrollmentMonth: string;
  issueDate: string;
  issuedBy: string;
}

// 学校ごとの設定
function getSchoolConfig(schoolName: string): {
  principal: string;
  legalName: string;
  officialName: string;
} {
  if (schoolName.includes("神奈川") || schoolName.includes("柔整") || schoolName.includes("鍼灸")) {
    return {
      principal: "竹見　国雄",
      legalName: "学校法人　平井学園",
      officialName: "神奈川柔整鍼灸専門学校",
    };
  }
  // デフォルト：中央ゼミナール系
  return {
    principal: "粕谷　裕一",
    legalName: "学校法人　羽場学園",
    officialName: schoolName.includes("中央") ? "中央ゼミナール" : schoolName,
  };
}

function buildNoticeHTML(data: AdmissionLetterData): string {
  const isPermit = data.type === "admission_permit";
  const school = getSchoolConfig(data.schoolName);
  const docTitle = isPermit ? "入　学　許　可　書" : "合　格　通　知　書";

  const e = escapeHtml;
  const issueDate = e(data.issueDate);
  const applicationNoSafe = e(data.applicationNo);
  const applicantNameSafe = e(data.applicantName);
  const schoolNameSafe = e(data.schoolName);
  const departmentSafe = e(data.department);
  const courseSafe = e(data.course);
  const principalSafe = e(school.principal);
  const legalNameSafe = e(school.legalName);
  const officialNameSafe = e(school.officialName);

  const enrollmentText = `${e(data.enrollmentYear)}年${e(data.enrollmentMonth)}月`;

  const bodyText = isPermit
    ? `あなたは所定の入学手続きを完了されましたので、${enrollmentText}より${officialNameSafe} ${departmentSafe}${courseSafe ? ` ${courseSafe}` : ""}への入学を許可いたします。`
    : `あなたは選考の結果、${enrollmentText}入学生として合格と決定いたしましたので、ご通知申し上げます。`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Noto Serif JP', 'Yu Mincho', 'YuMincho', '游明朝', 'Hiragino Mincho ProN', 'MS Mincho', serif;
    background: #fff;
    color: #000;
    width: 794px;
    min-height: 1123px;
  }

  .page {
    width: 794px;
    min-height: 1123px;
    padding: 80px 90px 80px 90px;
    position: relative;
    background: #fff;
  }

  /* 上部中央の角印（小） */
  .stamp-top {
    position: absolute;
    top: 68px;
    left: 50%;
    transform: translateX(-50%);
    width: 52px;
    height: 52px;
    border: 2.5px solid #cc0000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .stamp-top-inner {
    font-size: 10px;
    color: #cc0000;
    text-align: center;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.5px;
  }

  /* 右下の大きな角印 */
  .stamp-bottom {
    position: absolute;
    bottom: 92px;
    right: 90px;
    width: 72px;
    height: 72px;
    border: 2.5px solid #cc0000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .stamp-bottom-inner {
    font-size: 11px;
    color: #cc0000;
    text-align: center;
    font-weight: 600;
    line-height: 1.6;
    letter-spacing: 0.5px;
  }

  /* 発行番号 */
  .doc-number {
    text-align: left;
    font-size: 11px;
    margin-bottom: 8px;
    letter-spacing: 1px;
  }

  /* タイトル */
  .doc-title {
    font-size: 30px;
    font-weight: 700;
    text-align: center;
    letter-spacing: 16px;
    margin: 52px 0 48px;
    padding-top: 8px;
  }

  /* 発行日 */
  .issue-date {
    text-align: right;
    font-size: 13px;
    margin-bottom: 36px;
    letter-spacing: 1px;
  }

  /* 宛先ブロック */
  .recipient-block {
    margin-bottom: 40px;
  }

  .recipient-number {
    font-size: 12px;
    margin-bottom: 6px;
    letter-spacing: 0.5px;
  }

  .recipient-name {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 3px;
    margin-bottom: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #000;
    display: inline-block;
    min-width: 300px;
  }

  /* コース情報 */
  .course-info {
    margin-bottom: 36px;
    padding-left: 2px;
  }

  .course-line {
    font-size: 14px;
    line-height: 2.0;
    letter-spacing: 0.5px;
  }

  /* 本文 */
  .body-text {
    font-size: 15px;
    line-height: 2.6;
    text-align: justify;
    letter-spacing: 0.5px;
    margin-bottom: 32px;
    text-indent: 1em;
  }

  /* 特記事項 */
  .special-note {
    font-size: 12px;
    line-height: 2.0;
    margin-bottom: 40px;
    padding-left: 2px;
  }
  .special-note-label {
    font-weight: 700;
    font-size: 12px;
    display: inline;
    border: 1px solid #000;
    padding: 1px 4px;
    margin-right: 6px;
  }

  /* 署名ブロック */
  .sign-block {
    text-align: center;
    margin-top: 20px;
    padding-right: 80px;
  }

  .sign-line {
    font-size: 13px;
    line-height: 2.2;
    letter-spacing: 1.5px;
  }

  .sign-principal {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 3px;
    margin-top: 4px;
  }

  /* 注意書き */
  .notice-box {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #999;
    font-size: 11px;
    line-height: 1.9;
    color: #333;
  }
</style>
</head>
<body>
<div class="page">

  <!-- 上部角印 -->
  <div class="stamp-top">
    <div class="stamp-top-inner">学長<br>之印</div>
  </div>

  <!-- 発行番号 -->
  <div class="doc-number">第&nbsp;&nbsp;${applicationNoSafe}&nbsp;&nbsp;号</div>

  <!-- タイトル（固定文字列） -->
  <div class="doc-title">${docTitle}</div>

  <!-- 発行日 -->
  <div class="issue-date">${issueDate}</div>

  <!-- 宛先 -->
  <div class="recipient-block">
    <div class="recipient-name">${applicantNameSafe}&nbsp;様</div>
  </div>

  <!-- 志望コース情報 -->
  <div class="course-info">
    <div class="course-line">${schoolNameSafe}</div>
    <div class="course-line">${departmentSafe}${courseSafe ? `　${courseSafe}` : ""}</div>
    <div class="course-line">${enrollmentText}入学</div>
  </div>

  <!-- 本文 -->
  <div class="body-text">${bodyText}</div>

  ${isPermit ? '' : `
  <!-- 注意（合格通知書のみ） -->
  <div class="special-note">
    入学手続きの詳細については、出願ポータルよりご確認ください。<br>
    所定の手続き期限までに手続きが完了しない場合、入学資格を失う場合があります。
  </div>
  `}

  <!-- 署名 -->
  <div class="sign-block">
    <div class="sign-line">${legalNameSafe}</div>
    <div class="sign-line">${officialNameSafe}</div>
    <div class="sign-line">校　長</div>
    <div class="sign-principal">${principalSafe}</div>
  </div>

  <!-- 右下の大きな角印 -->
  <div class="stamp-bottom">
    <div class="stamp-bottom-inner">校長<br>之印</div>
  </div>

  <!-- 注意書き -->
  <div class="notice-box">
    ${isPermit
      ? "・本書は入学許可を証明する書類です。在留資格（留学）の申請・更新にご利用いただけます。<br>・本書の内容についてご不明な点は、入学相談室（平日9:00〜17:00）までお問い合わせください。"
      : "・本通知書は合格の通知であり、入学許可書ではありません。<br>・入学許可書は入学手続き完了後に発行いたします。<br>・ご不明な点は入学相談室（平日9:00〜17:00）までお問い合わせください。"
    }
  </div>

</div>
</body>
</html>`;
}

export async function generateAdmissionPDF(data: AdmissionLetterData): Promise<Buffer> {
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
    throw new Error(
      "Chromium/Chrome not found. Set PUPPETEER_EXECUTABLE_PATH to a Chrome binary.",
    );
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    const html = buildNoticeHTML(data);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });

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
