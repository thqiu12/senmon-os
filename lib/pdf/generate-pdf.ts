import puppeteer from "puppeteer-core";
import { existsSync } from "fs";
import { escapeHtml } from "@/lib/security";
import { institutionSealText, schoolSealHtml } from "@/lib/pdf/seal";
import { PLEDGE_INTRO, PLEDGE_ITEMS } from "@/lib/pledge";

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

  // 電子印：学校の印影画像があれば実印影、無ければ法人公印の CSS 角印を校長名に重ねて捺印
  const officialSealHtml = schoolSealHtml(
    data.schoolName,
    institutionSealText(school.legalName),
    { size: 80, rotate: -4 },
  );

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
    padding: 76px 84px 80px 84px;
    position: relative;
    background: #fff;
  }

  /* 罫線の装飾枠（公文書らしさ） */
  .doc-frame {
    position: absolute;
    top: 40px; left: 44px; right: 44px; bottom: 44px;
    border: 1.5px solid #1a2c45;
    pointer-events: none;
  }
  .doc-frame::after {
    content: "";
    position: absolute;
    top: 4px; left: 4px; right: 4px; bottom: 4px;
    border: 0.75px solid #1a2c45;
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

  /* 署名ブロック（右寄せ・校長名に公印を重ねる） */
  .sign-block {
    position: relative;
    text-align: right;
    margin-top: 28px;
    padding-right: 96px;
  }

  .sign-line {
    font-size: 13px;
    line-height: 2.2;
    letter-spacing: 1.5px;
  }

  .sign-principal {
    position: relative;
    display: inline-block;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 4px;
    margin-top: 6px;
  }
  /* 校長名の右に重ねる公印（角印） */
  .sign-principal .seal-official {
    position: absolute;
    right: -78px;
    top: 50%;
    transform: translateY(-50%);
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

  <!-- 装飾枠 -->
  <div class="doc-frame"></div>

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

  <!-- 署名（校長名に公印を重ねて捺印） -->
  <div class="sign-block">
    <div class="sign-line">${legalNameSafe}</div>
    <div class="sign-line">${officialNameSafe}</div>
    <div class="sign-line">校　長</div>
    <div class="sign-principal">${principalSafe}<span class="seal-official">${officialSealHtml}</span></div>
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

// HTML → PDF（A4）。Chromium 起動を共通化。
async function renderHtmlToPdf(html: string): Promise<Buffer> {
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

export async function generateAdmissionPDF(data: AdmissionLetterData): Promise<Buffer> {
  return renderHtmlToPdf(buildNoticeHTML(data));
}

// ===== 入学誓約書 =====
export interface EnrollmentPledgeData {
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
  signerName: string;
  signedAt: string;        // 表示用にフォーマット済みの日付文字列
  signatureDataUri: string; // canvas の DataURI（PNG）
}

function buildPledgeHTML(d: EnrollmentPledgeData): string {
  const sc = getSchoolConfig(d.schoolName);
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:"Hiragino Mincho ProN","Yu Mincho",serif; color:#1a1a1a; }
  .page { width:210mm; min-height:297mm; padding:28mm 24mm; position:relative; }
  h1 { text-align:center; font-size:26px; letter-spacing:.4em; margin-bottom:28px; font-weight:700; }
  .addressee { font-size:15px; margin-bottom:18px; }
  .body { font-size:14px; line-height:2.1; margin-bottom:22px; }
  .info { border:1px solid #555; border-collapse:collapse; width:100%; font-size:13px; margin:18px 0 26px; }
  .info th,.info td { border:1px solid #999; padding:8px 12px; text-align:left; }
  .info th { background:#f3f4f6; width:32%; font-weight:600; }
  .pledge-list { font-size:14px; line-height:2.0; margin:6px 0 26px; padding-left:1.2em; }
  .pledge-list li { margin-bottom:6px; }
  .sign-area { margin-top:30px; display:flex; justify-content:flex-end; }
  .sign-box { width:60%; }
  .sign-row { display:flex; align-items:flex-end; gap:12px; margin-bottom:10px; }
  .sign-label { font-size:13px; color:#555; width:90px; }
  .sign-val { font-size:15px; border-bottom:1px solid #333; flex:1; padding-bottom:4px; }
  .sign-img { height:70px; max-width:240px; object-fit:contain; }
  .date { text-align:right; font-size:13px; margin-bottom:18px; }
</style></head>
<body><div class="page">
  <h1>入学誓約書</h1>
  <p class="addressee">${e(sc.legalName)}　${e(sc.officialName)}　御中</p>
  <p class="body">${e(PLEDGE_INTRO)}</p>
  <table class="info">
    <tr><th>出願番号</th><td>${e(d.applicationNo)}</td></tr>
    <tr><th>氏名</th><td>${e(d.applicantName)}（${e(d.applicantNameKana)}）</td></tr>
    <tr><th>国籍</th><td>${e(d.nationality)}</td></tr>
    <tr><th>生年月日</th><td>${e(d.birthDate)}</td></tr>
    <tr><th>入学</th><td>${e(d.enrollmentYear)}年${e(d.enrollmentMonth)}月　${e(d.department)}${d.course ? "（" + e(d.course) + "）" : ""}</td></tr>
  </table>
  <p class="body" style="margin-bottom:6px;">記</p>
  <ol class="pledge-list">
    ${PLEDGE_ITEMS.map((i) => `<li>${e(i)}</li>`).join("\n    ")}
  </ol>
  <p class="date">${e(d.signedAt)}　電子署名</p>
  <div class="sign-area"><div class="sign-box">
    <div class="sign-row"><span class="sign-label">署名者氏名</span><span class="sign-val">${e(d.signerName)}</span></div>
    <div class="sign-row"><span class="sign-label">署名</span><span class="sign-val" style="border:0;"><img class="sign-img" src="${d.signatureDataUri}" alt="署名" /></span></div>
  </div></div>
</div></body></html>`;
}

export async function generateEnrollmentPledgePDF(data: EnrollmentPledgeData): Promise<Buffer> {
  return renderHtmlToPdf(buildPledgeHTML(data));
}
