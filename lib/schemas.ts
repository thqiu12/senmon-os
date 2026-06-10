import { z } from "zod";

const str = (max: number) => z.string().trim().min(1).max(max);
const optStr = (max: number) => z.string().trim().max(max).optional().nullable();

// 空文字列を null に正規化したうえで email 形式を検証する。
// 既存フォームは未入力欄を "" で送ってくるため、`.email()` 単体では
// 「Invalid email」になってしまうことへの対策。
const optEmail = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().email().max(254).nullable(),
);

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
  "選考費振込証明書",
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
  phone: z.string().trim().min(6).max(30).regex(/^[\d\-+() ]+$/, "電話番号の形式が正しくありません"),
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
  // 学校設定で「不要」にできる項目は API 層では空文字を許容（DB は NOT NULL）
  applicationReason: z.string().trim().max(2000).default(""),
  lastSchoolName: z.string().trim().max(100).default(""),
  lastSchoolCountry: z.string().trim().max(50).default(""),
  lastSchoolGraduate: z.string().trim().max(50).default(""),
  lastSchoolGraduatedOn: optStr(20),
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
  applicantEmail: optEmail.optional(),
  interviewDate: optStr(20),
  interviewTime: optStr(20),
  interviewPlace: optStr(200),
  interviewNotes: optStr(1000),
  resultStatus: z.enum(["合格", "補欠合格", "不合格"]).optional(),
  instructions: optStr(2000),
  deadline: optStr(50),
  // 併願対応: 志望校別の試験通知用。priorityLabel が入っているとメールタイトル・本文に出る。
  schoolName: optStr(100),
  department: optStr(100),
  priorityLabel: optStr(20),
  // 筆記試験情報（一般課程の通知に含める。免除時は writtenExamExempted=true）
  writtenExamDate: optStr(20),
  writtenExamTime: optStr(20),
  writtenExamPlace: optStr(200),
  writtenExamNotes: optStr(1000),
  writtenExamExempted: z.boolean().optional(),
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

/** 基本情報変更申請: 学生→管理者の変更リクエスト作成 */
export const ChangeRequestCreateSchema = z.object({
  fieldKey: z.string().min(1).max(40),
  newValue: z.string().min(1).max(500),
  reason: optStr(500),
  // 学生からの呼び出し時のみ
  applicationNo: optStr(50),
  email: optEmail.optional(),
});

/** 基本情報変更申請: 管理者によるレビュー（承認 / 却下） */
export const ChangeRequestReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewerNote: optStr(500),
});

/**
 * 希望者リスト (Prospect): 渠道から学生情報を事前申告する CRM 用フォーム。
 */
export const ProspectCreateSchema = z.object({
  // 必須
  lastName: str(50),
  firstName: str(50),
  agentId: str(40),
  // 任意 (マッチング精度向上 + 後の出願引き継ぎ用)
  lastNameKana: optStr(50),
  firstNameKana: optStr(50),
  birthDate: optStr(20),
  gender: optStr(20),
  nationality: optStr(50),
  email: optEmail.optional(),
  phone: optStr(30),
  intendedSchool: optStr(100),
  intendedDepartment: optStr(100),
  enrollmentYear: optStr(10),
  enrollmentMonth: optStr(5),
  expectedApplyDate: optStr(20),
  agentNotes: optStr(1000),
  // 渠道用シークレットトークン（任意。あれば agentId と整合チェック）
  formToken: optStr(80),
});

export const ProspectAdminPatchSchema = z.object({
  status: z.enum(["候補", "出願済", "辞退", "重複（他渠道優先）", "無効"]).optional(),
  adminMemo: optStr(1000),
  matchedApplicationId: optStr(40),
});

export const ChatPostSchema = z.object({
  applicationNo: optStr(50),
  studentNo: optStr(50),
  email: z.string().email().max(254),
  message: z.string().trim().min(1).max(2000),
});

const cuid = () => z.string().min(20).max(40);

export const ApplicationStatusEnum = z.enum([
  "受付中",
  "書類待ち",
  "書類確認中",
  "面接待ち",
  "合格",
  "補欠合格",
  "不合格",
  "保留",
  "辞退",
]);

export const ApplicationPatchSchema = z
  .object({
    status: ApplicationStatusEnum.optional(),
    adminMemo: optStr(2000),
    addNote: optStr(2000),
    noteVisibleToStudent: z.boolean().optional(),
    interviewDate: optStr(20),
    interviewTime: optStr(20),
    interviewPlace: optStr(200),
    interviewNotes: optStr(1000),
    interviewEmailSent: z.boolean().optional(),
    resultEmailSent: z.boolean().optional(),
    agentId: z.string().max(40).nullable().optional(),
    cohortId: z.string().max(40).nullable().optional(),
    examMode: ExamModeEnum.optional(),
    referrerName: optStr(100),
    referrerType: optStr(50),
  })
  .strict();

export const FeeStatusEnum = z.enum(["未払い", "振込済み", "確認中", "確認済み", "免除"]);
export const FeePatchSchema = z
  .object({
    examFeeStatus: FeeStatusEnum.optional(),
    examFeeAmount: z.number().int().nonnegative().optional(),
    examFeeReceiptUrl: z
      .preprocess(
        (v) => (v === "" || v === undefined ? null : v),
        z
          .string()
          .max(500)
          .refine(
            (u) => u.startsWith("/uploads/") || u.startsWith("https://"),
            "URL must be /uploads/* or https",
          )
          .nullable(),
      )
      .optional(),
    examFeeNote: optStr(500),
  })
  .strict();

export const InterviewerCreateSchema = z.object({
  name: str(100),
  role: optStr(100),
  email: optEmail.optional(),
});
export const InterviewerPatchSchema = InterviewerCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const InterviewFeedbackSchema = z.object({
  applicationId: cuid(),
  interviewerName: str(100),
  interviewerId: z.string().max(40).optional().nullable(),
  scoreJapanese: z.coerce.number().int().min(1).max(5).optional().nullable(),
  scoreMotivation: z.coerce.number().int().min(1).max(5).optional().nullable(),
  scorePersonality: z.coerce.number().int().min(1).max(5).optional().nullable(),
  scoreAcademic: z.coerce.number().int().min(1).max(5).optional().nullable(),
  scoreOverall: z.coerce.number().int().min(1).max(5).optional().nullable(),
  strengths: optStr(2000),
  concerns: optStr(2000),
  notes: optStr(2000),
  recommendation: z.enum(["合格推薦", "不合格推薦", "保留"]).default("保留"),
});

export const AgentCreateSchema = z.object({
  name: str(100),
  country: z.string().trim().max(100).optional().default(""),
  contactName: optStr(100),
  contactEmail: optEmail.optional(),
  notes: optStr(2000),
});
export const AgentPatchSchema = AgentCreateSchema.partial().extend({ isActive: z.boolean().optional() });

export const AnnouncementCreateSchema = z.object({
  title: str(200),
  content: str(10000),
  targetType: z.enum(["all", "合格者", "specific_cohort", "status_filter", "filter"]).default("all"),
  targetCohortId: z.string().max(40).optional().nullable(),
  targetSchool: z.string().max(120).optional().nullable(),
  targetStatus: ApplicationStatusEnum.optional().nullable(),
});

export const CertificateRequestSchema = z.object({
  studentId: cuid(),
  type: z.enum(["在籍証明書", "出席率証明書", "成績証明書", "卒業見込証明書"]),
  purpose: optStr(500),
  copies: z.coerce.number().int().min(1).max(20).default(1),
});

export const LeaveRequestSchema = z.object({
  studentId: cuid(),
  type: z.enum(["欠席届", "遅刻届", "早退届", "休学申請"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: str(2000),
});

export const HomeworkSchema = z.object({
  subjectId: cuid(),
  title: str(200),
  description: optStr(5000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxScore: z.coerce.number().int().min(0).max(1000).default(100),
  isPublished: z.boolean().optional().default(false),
});

const AttendanceStatusEnum = z.enum(["出席", "欠席", "遅刻", "早退", "公欠"]);
export const AttendanceRecordsSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: cuid(),
        subjectId: cuid(),
        timetableSlotId: z.string().max(40).optional().nullable(),
        teacherId: z.string().max(40).optional().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: AttendanceStatusEnum,
        note: optStr(500),
      }),
    )
    .min(1)
    .max(500),
});

export const QuotaSchema = z.object({
  schoolName: str(100),
  department: str(100),
  enrollmentYear: z.string().regex(/^\d{4}$/),
  quota: z.coerce.number().int().min(0).max(10000),
  memo: optStr(500),
});

const CohortStatusEnum = z.enum(["受付中", "選考中", "完了"]);
const TuitionPlanEnum = z.enum(["全額", "分割（2期）"]);

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "ISO datetime expected");

export const CohortCreateSchema = z.object({
  name: str(200),
  description: optStr(2000),
  examDate: optStr(50),
  deadline: optStr(50),
  status: CohortStatusEnum.default("受付中"),
  isDefault: z.boolean().optional().default(false),
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  round: z.coerce.number().int().min(1).max(99).optional(),
  schoolKey: optStr(100),
  acceptStart: isoDate.optional().nullable(),
  acceptEnd: isoDate.optional().nullable(),
  defaultTuitionPlan: TuitionPlanEnum.optional().nullable(),
  defaultTuitionAmount: optStr(50),
  defaultTuitionAmount2: optStr(50),
  defaultTuitionDeadline: optStr(50),
  defaultTuitionDeadline2: optStr(50),
  defaultTuitionBankInfo: optStr(500),
  defaultStep2Deadline: optStr(50),
  defaultStep3Deadline: optStr(50),
  // 選考モード別の学費（一般/指定推薦/特待生 などのキーから金額文字列へのマップ）
  examModeTuitionAmounts: z
    .union([
      z.string().max(2000),
      z.record(z.string().max(20), z.string().max(50)),
    ])
    .optional()
    .nullable(),
  resultPublishedAt: isoDate.optional().nullable(),
});
export const CohortPatchSchema = CohortCreateSchema.partial();

export const TimetableSlotSchema = z.object({
  subjectId: cuid(),
  teacherId: z.string().max(40).optional().nullable(),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  period: z.coerce.number().int().min(1).max(8),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: optStr(50),
});
export const TimetableCreateSchema = z.object({
  schoolId: cuid(),
  classId: cuid(),
  name: optStr(100),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: optStr(20),
  slots: z.array(TimetableSlotSchema).max(200).optional(),
});

const SchoolDepartmentSchema = z.object({
  name: str(100),
  duration: z.string().max(50).optional().default(""),
  courses: z.array(str(100)).max(50).optional().default([]),
});

export const ApplySchoolUpsertSchema = z.object({
  schoolKey: z.string().regex(/^[a-z0-9-]+$/, "lowercase alnum + hyphen only").max(100),
  name: str(100),
  hojin: str(200),
  icon: z.string().max(20).optional().default("🏫"),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
  departments: z.array(SchoolDepartmentSchema).max(50),
});

const VisaStatusEnum = z.enum(["未申請", "申請中", "発給済", "却下"]);
const DormStatusEnum = z.enum(["未申請", "申請中", "決定", "辞退"]);

export const EnrollmentUpsertSchema = z.object({
  applicationId: cuid(),
  publish: z.boolean().optional(),
  instructions: optStr(5000),
  deadline: optStr(50),
  step1Deadline: optStr(50),
  step2Deadline: optStr(50),
  step3Deadline: optStr(50),
  tuitionPlan: TuitionPlanEnum.optional(),
  tuitionPaid: z.boolean().optional(),
  tuitionPaidAt: isoDate.optional().nullable(),
  tuitionAmount: optStr(50),
  tuitionAmount2: optStr(50),
  tuitionDeadline2: optStr(50),
  tuitionBankInfo: optStr(500),
  docSubmitted: z.boolean().optional(),
  docSubmittedAt: isoDate.optional().nullable(),
  docChecklist: z.union([z.string().max(20000), z.array(z.unknown())]).optional(),
  visaStatus: VisaStatusEnum.optional(),
  visaNote: optStr(1000),
  dormApply: z.boolean().optional(),
  dormStatus: DormStatusEnum.optional(),
  dormNote: optStr(1000),
  adminNote: optStr(2000),
});
