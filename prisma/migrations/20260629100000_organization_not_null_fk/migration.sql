-- Phase C: organizationId を DB レベルで NOT NULL 化 + Organization への FK を付与（テナント隔離の纵深防御）。
--
-- 方針(案A): Prisma schema 側の organizationId は String?（nullable）のまま据え置く。
--   テナント拡張(tenantPrisma)が実行時に organizationId を注入する設計のため、
--   schema を必須化すると全 create の型が organizationId を要求してしまう。
--   → DB のみ NOT NULL + FK で締め、型互換を保つ。Plan 3 で RLS を追加して更に纵深化する。
--
-- ⚠️ schema(nullable) と DB(NOT NULL) は意図的に乖離。`prisma migrate dev` はこの差分を
--    「nullable に戻す」移行として検出し得る → 生成されても破棄すること。本リポジトリは移行を
--    手書き運用（0_init 等）なので通常 migrate dev は使わない。
--
-- 自己安全設計: NOT NULL 化の前に organizationId IS NULL の行を最古の Organization
--   （本番=知日グループ）へ寄せる。Phase B で backfill 済みのため通常 no-op。新規DB(行0)でも安全。
--
-- AdminUser は NOT NULL から除外: PlatformAdmin（テナント横断運営者）は organizationId=null を
--   取り得る（lib/auth.ts）。FK は付与（null 許容FK）。

-- AdminNote
UPDATE "AdminNote" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "AdminNote" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AdminUser （PlatformAdmin=null 許容のため NOT NULL は付けない。FK のみ）
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agent
UPDATE "Agent" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Agent" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Announcement
UPDATE "Announcement" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Announcement" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application
UPDATE "Application" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Application" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Application" ADD CONSTRAINT "Application_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ApplicationSchool
UPDATE "ApplicationSchool" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "ApplicationSchool" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ApplicationSchool" ADD CONSTRAINT "ApplicationSchool_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ApplyDepartment
UPDATE "ApplyDepartment" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "ApplyDepartment" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ApplyDepartment" ADD CONSTRAINT "ApplyDepartment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ApplySchool
UPDATE "ApplySchool" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "ApplySchool" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ApplySchool" ADD CONSTRAINT "ApplySchool_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Attendance
UPDATE "Attendance" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Attendance" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AuditLog
UPDATE "AuditLog" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CalendarEvent
UPDATE "CalendarEvent" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "CalendarEvent" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CertificateRequest
UPDATE "CertificateRequest" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "CertificateRequest" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ChangeRequest
UPDATE "ChangeRequest" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "ChangeRequest" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ChatMessage
UPDATE "ChatMessage" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Class
UPDATE "Class" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Class" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Class" ADD CONSTRAINT "Class_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cohort
UPDATE "Cohort" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Cohort" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Course
UPDATE "Course" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Course" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Course" ADD CONSTRAINT "Course_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Document
UPDATE "Document" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Document" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EnrollmentProcedure
UPDATE "EnrollmentProcedure" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "EnrollmentProcedure" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "EnrollmentProcedure" ADD CONSTRAINT "EnrollmentProcedure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EnrollmentQuota
UPDATE "EnrollmentQuota" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "EnrollmentQuota" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "EnrollmentQuota" ADD CONSTRAINT "EnrollmentQuota_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EnrollmentSignature
UPDATE "EnrollmentSignature" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "EnrollmentSignature" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "EnrollmentSignature" ADD CONSTRAINT "EnrollmentSignature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FormFieldConfig
UPDATE "FormFieldConfig" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "FormFieldConfig" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "FormFieldConfig" ADD CONSTRAINT "FormFieldConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Homework
UPDATE "Homework" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Homework" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HomeworkSubmission
UPDATE "HomeworkSubmission" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "HomeworkSubmission" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- InterviewFeedback
UPDATE "InterviewFeedback" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "InterviewFeedback" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Interviewer
UPDATE "Interviewer" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Interviewer" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Interviewer" ADD CONSTRAINT "Interviewer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LeaveRequest
UPDATE "LeaveRequest" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "LeaveRequest" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prospect
UPDATE "Prospect" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Prospect" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- School
UPDATE "School" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "School" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "School" ADD CONSTRAINT "School_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SchoolNotice
UPDATE "SchoolNotice" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "SchoolNotice" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "SchoolNotice" ADD CONSTRAINT "SchoolNotice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Student
UPDATE "Student" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Student" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Student" ADD CONSTRAINT "Student_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Subject
UPDATE "Subject" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Subject" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SystemSetting
UPDATE "SystemSetting" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "SystemSetting" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Teacher
UPDATE "Teacher" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Teacher" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Timetable
UPDATE "Timetable" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Timetable" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Timetable" ADD CONSTRAINT "Timetable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TimetableSlot
UPDATE "TimetableSlot" SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "TimetableSlot" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

