import type { Prisma } from "@prisma/client";
import { formatDateTimeJP } from "@/lib/utils";
import { isCustomField } from "@/lib/applyCustomFields";

export const CSV_INCLUDE = {
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
export type CsvApp = Prisma.ApplicationGetPayload<{ include: typeof CSV_INCLUDE }>;

export type BuiltinCol = { key: string; label: string; resolve: (a: CsvApp) => string };

// 面接フィードバックの集計(export route と同一ロジック)
function interviewAvg(a: CsvApp): string {
  const fbs = a.interviewFeedbacks ?? [];
  const valid = fbs.filter((f) => f.scoreOverall !== null);
  return valid.length > 0
    ? (valid.reduce((s, f) => s + (f.scoreOverall ?? 0), 0) / valid.length).toFixed(1)
    : "";
}
function interviewRec(a: CsvApp): string {
  const fbs = a.interviewFeedbacks ?? [];
  return fbs.length > 0 ? (fbs[0].recommendation ?? "") : "";
}

export const BUILTIN_CSV_COLUMNS: BuiltinCol[] = [
  { key: "applicationNo", label: "申請番号", resolve: (a) => a.applicationNo },
  { key: "status", label: "状態", resolve: (a) => a.status },
  { key: "createdAt", label: "申請日時", resolve: (a) => formatDateTimeJP(a.createdAt) },
  { key: "lastName", label: "姓", resolve: (a) => a.lastName },
  { key: "firstName", label: "名", resolve: (a) => a.firstName },
  { key: "lastNameKana", label: "姓（カナ）", resolve: (a) => a.lastNameKana },
  { key: "firstNameKana", label: "名（カナ）", resolve: (a) => a.firstNameKana },
  { key: "birthDate", label: "生年月日", resolve: (a) => a.birthDate },
  { key: "gender", label: "性別", resolve: (a) => a.gender },
  { key: "nationality", label: "国籍", resolve: (a) => a.nationality },
  { key: "phone", label: "電話番号", resolve: (a) => a.phone },
  { key: "email", label: "メールアドレス", resolve: (a) => a.email },
  { key: "postalCode", label: "郵便番号", resolve: (a) => a.postalCode },
  { key: "prefecture", label: "都道府県", resolve: (a) => a.prefecture },
  { key: "city", label: "市区町村", resolve: (a) => a.city },
  { key: "address", label: "住所", resolve: (a) => a.address },
  { key: "addressDetail", label: "住所詳細", resolve: (a) => a.addressDetail || "" },
  { key: "residenceStatus", label: "在留資格", resolve: (a) => a.residenceStatus || "" },
  { key: "residenceExpiry", label: "在留期限", resolve: (a) => a.residenceExpiry || "" },
  { key: "japaneseLevel", label: "日本語レベル", resolve: (a) => a.japaneseLevel },
  { key: "jlptCertified", label: "JLPT取得", resolve: (a) => (a.jlptCertified ? "あり" : "なし") },
  { key: "schoolName", label: "志望校", resolve: (a) => a.schoolName },
  { key: "department", label: "志望学科", resolve: (a) => a.department },
  { key: "course", label: "志望コース", resolve: (a) => a.course || "" },
  { key: "enrollmentYear", label: "入学希望年", resolve: (a) => a.enrollmentYear },
  { key: "enrollmentMonth", label: "入学希望月", resolve: (a) => a.enrollmentMonth },
  { key: "applicationReason", label: "志望動機", resolve: (a) => a.applicationReason },
  { key: "lastSchoolName", label: "最終学歴（学校名）", resolve: (a) => a.lastSchoolName },
  { key: "lastSchoolCountry", label: "最終学歴（国）", resolve: (a) => a.lastSchoolCountry },
  { key: "lastSchoolGraduate", label: "卒業状況", resolve: (a) => a.lastSchoolGraduate },
  { key: "workExperience", label: "職務経歴", resolve: (a) => a.workExperience || "" },
  { key: "documents", label: "提出書類", resolve: (a) => a.documents.map((d) => d.docType).join("／") },
  { key: "interviewAvg", label: "面接総合スコア", resolve: interviewAvg },
  { key: "interviewRec", label: "面接推薦", resolve: interviewRec },
  { key: "epStatus", label: "入学手続きステータス", resolve: (a) => a.enrollmentProcedure?.status ?? "" },
  {
    key: "epTuition",
    label: "学費振込",
    resolve: (a) => {
      const ep = a.enrollmentProcedure;
      return ep ? (ep.tuitionPaidAt ? "振込済" : "未振込") : "";
    },
  },
  {
    key: "epSchool",
    label: "学校承認",
    resolve: (a) => {
      const ep = a.enrollmentProcedure;
      return ep ? (ep.schoolConfirmed ? "承認済" : "未") : "";
    },
  },
  {
    key: "epAdmit",
    label: "許可書発行",
    resolve: (a) => {
      const ep = a.enrollmentProcedure;
      return ep ? (ep.admitLetterIssued ? "発行済" : "未") : "";
    },
  },
  { key: "agentName", label: "エージェント名", resolve: (a) => a.agent?.name ?? "" },
  // --- 既定(現行 HEADERS)を超える追加の組み込み列(既定には含めない) ---
  { key: "priorAttendanceRate", label: "日本語学校での出席率", resolve: (a) => a.priorAttendanceRate || "" },
  { key: "lastSchoolGraduatedOn", label: "卒業（見込）年月", resolve: (a) => a.lastSchoolGraduatedOn || "" },
  { key: "source", label: "流入元", resolve: (a) => a.source || "" },
  { key: "utmCampaign", label: "広告キャンペーン", resolve: (a) => a.utmCampaign || "" },
  { key: "referrer", label: "流入元URL", resolve: (a) => a.referrer || "" },
];

// 現行 export の HEADERS 列(順序どおり・現行 route.ts と同一)
export const DEFAULT_CSV_COLUMN_KEYS: string[] = [
  "applicationNo", "status", "createdAt", "lastName", "firstName", "lastNameKana", "firstNameKana",
  "birthDate", "gender", "nationality", "phone", "email", "postalCode", "prefecture", "city",
  "address", "addressDetail", "residenceStatus", "residenceExpiry", "japaneseLevel", "jlptCertified",
  "schoolName", "department", "course", "enrollmentYear", "enrollmentMonth", "applicationReason",
  "lastSchoolName", "lastSchoolCountry", "lastSchoolGraduate", "workExperience", "documents",
  "interviewAvg", "interviewRec", "epStatus", "epTuition", "epSchool", "epAdmit", "agentName",
];

export const BUILTIN_MAP = new Map(BUILTIN_CSV_COLUMNS.map((c) => [c.key, c] as const));

export type ColRef = { key: string; label: string };

export function customCsvColumns(
  rows: { fieldKey: string; label: string; fieldType?: string | null }[],
): ColRef[] {
  const seen = new Set<string>();
  const out: ColRef[] = [];
  for (const r of rows) {
    if (!isCustomField(r.fieldKey, r.fieldType)) continue;
    if (seen.has(r.fieldKey)) continue;
    seen.add(r.fieldKey);
    out.push({ key: r.fieldKey, label: r.label || r.fieldKey });
  }
  return out;
}

export function resolveRow(
  app: CsvApp,
  columns: ColRef[],
  extra: Record<string, unknown> | null | undefined,
): string[] {
  return columns.map((c) => {
    const b = BUILTIN_MAP.get(c.key);
    if (b) return b.resolve(app);
    const v = extra?.[c.key];
    return v == null ? "" : String(v);
  });
}

export function defaultColumns(): ColRef[] {
  return DEFAULT_CSV_COLUMN_KEYS.map((k) => {
    const b = BUILTIN_MAP.get(k)!;
    return { key: k, label: b.label };
  });
}

export function sanitizeColumns(input: unknown, customKeys: Set<string>): ColRef[] {
  if (!Array.isArray(input)) return defaultColumns();
  const out: ColRef[] = [];
  for (const x of input) {
    if (!x || typeof x.key !== "string") continue;
    const b = BUILTIN_MAP.get(x.key);
    if (!b && !customKeys.has(x.key)) continue;
    out.push({
      key: x.key,
      label: typeof x.label === "string" && x.label ? x.label : (b?.label ?? x.key),
    });
  }
  return out.length ? out : defaultColumns();
}
