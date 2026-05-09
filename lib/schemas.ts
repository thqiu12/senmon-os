import { z } from "zod";

const str = (max: number) => z.string().trim().min(1).max(max);
const optStr = (max: number) => z.string().trim().max(max).optional().nullable();

export const JapaneseLevelEnum = z.enum(["N1", "N2", "N3", "N4", "N5", "なし"]);
export const GenderEnum = z.enum(["男性", "女性", "その他"]);
export const ExamModeEnum = z.enum(["一般", "指定推薦", "特待生"]);

export const DocTypeEnum = z.enum([
  "証明写真（3×3cm）",
  "最終学校の成績証明書",
  "最終学校の出席状況証明書",
  "JLPT成績証明書",
  "EJU成績証明書",
  "高校卒業証明書",
  "高校成績証明書",
  "大学卒業証明書",
  "大学成績証明書",
  "在学証明書",
  "英語能力証明書",
  "その他書類",
  "パスポート",
  "在留カード",
  "卒業証明書",
  "成績証明書",
  "日本語能力証明",
  "その他",
]);

export const RoleEnum = z.enum(["super_admin", "admin", "interviewer"]);

export const ApplicationCreateSchema = z.object({
  lastName: str(50),
  firstName: str(50),
  lastNameKana: str(50),
  firstNameKana: str(50),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: GenderEnum,
  nationality: str(50),
  phone: z.string().regex(/^[\d\-+() ]{6,20}$/),
  email: z.string().email().max(254),
  postalCode: str(20),
  prefecture: str(20),
  city: str(100),
  address: str(200),
  addressDetail: optStr(200),
  residenceStatus: optStr(50),
  residenceExpiry: optStr(20),
  japaneseLevel: JapaneseLevelEnum,
  jlptCertified: z.boolean().optional(),
  schoolName: str(100),
  department: str(100),
  course: optStr(100),
  enrollmentYear: str(4),
  enrollmentMonth: str(2),
  applicationReason: str(2000),
  lastSchoolName: str(100),
  lastSchoolCountry: str(50),
  lastSchoolGraduate: str(50),
  priorAttendanceRate: optStr(20),
  workExperience: optStr(2000),
  examMode: ExamModeEnum.optional(),
  referrerName: optStr(100),
  referrerType: optStr(50),
  status: z.string().max(20).optional(),
  additionalSchools: z
    .array(
      z.object({
        schoolName: str(100),
        department: str(100),
        course: optStr(100),
      }),
    )
    .max(5)
    .optional(),
});

export const NotificationSchema = z.object({
  type: z.enum(["interview", "result", "enrollment"]),
  to: z.string().email().max(254),
  applicantName: str(100),
  applicationNo: str(50),
  applicantEmail: z.string().email().max(254).optional(),
  interviewDate: optStr(20),
  interviewTime: optStr(20),
  interviewPlace: optStr(200),
  interviewNotes: optStr(1000),
  resultStatus: z.enum(["合格", "補欠合格", "不合格"]).optional(),
  instructions: optStr(2000),
  deadline: optStr(50),
});

export const AdminLoginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const AdminAccountCreateSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(200),
  displayName: str(100),
  role: RoleEnum,
});

export const AdminAccountUpdateSchema = z.object({
  displayName: str(100).optional(),
  role: RoleEnum.optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export const ChatPostSchema = z.object({
  applicationNo: optStr(50),
  studentNo: optStr(50),
  email: z.string().email().max(254),
  message: z.string().trim().min(1).max(2000),
});
