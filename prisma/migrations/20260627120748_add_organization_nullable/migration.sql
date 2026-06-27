-- AlterTable
ALTER TABLE "AdminNote" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ApplicationSchool" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ApplyDepartment" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ApplySchool" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CertificateRequest" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ChangeRequest" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Cohort" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EnrollmentProcedure" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EnrollmentQuota" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EnrollmentSignature" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "FormFieldConfig" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Homework" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "HomeworkSubmission" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "InterviewFeedback" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Interviewer" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SchoolNotice" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SystemSetting" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Timetable" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "TimetableSlot" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customDomain" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'pro',
    "enabledModules" TEXT NOT NULL DEFAULT '["admissions","enrollment"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_customDomain_key" ON "Organization"("customDomain");

-- CreateIndex
CREATE INDEX "AdminNote_organizationId_idx" ON "AdminNote"("organizationId");

-- CreateIndex
CREATE INDEX "AdminUser_organizationId_idx" ON "AdminUser"("organizationId");

-- CreateIndex
CREATE INDEX "Agent_organizationId_idx" ON "Agent"("organizationId");

-- CreateIndex
CREATE INDEX "Announcement_organizationId_idx" ON "Announcement"("organizationId");

-- CreateIndex
CREATE INDEX "Application_organizationId_idx" ON "Application"("organizationId");

-- CreateIndex
CREATE INDEX "ApplicationSchool_organizationId_idx" ON "ApplicationSchool"("organizationId");

-- CreateIndex
CREATE INDEX "ApplyDepartment_organizationId_idx" ON "ApplyDepartment"("organizationId");

-- CreateIndex
CREATE INDEX "ApplySchool_organizationId_idx" ON "ApplySchool"("organizationId");

-- CreateIndex
CREATE INDEX "Attendance_organizationId_idx" ON "Attendance"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "CalendarEvent_organizationId_idx" ON "CalendarEvent"("organizationId");

-- CreateIndex
CREATE INDEX "CertificateRequest_organizationId_idx" ON "CertificateRequest"("organizationId");

-- CreateIndex
CREATE INDEX "ChangeRequest_organizationId_idx" ON "ChangeRequest"("organizationId");

-- CreateIndex
CREATE INDEX "ChatMessage_organizationId_idx" ON "ChatMessage"("organizationId");

-- CreateIndex
CREATE INDEX "Class_organizationId_idx" ON "Class"("organizationId");

-- CreateIndex
CREATE INDEX "Cohort_organizationId_idx" ON "Cohort"("organizationId");

-- CreateIndex
CREATE INDEX "Course_organizationId_idx" ON "Course"("organizationId");

-- CreateIndex
CREATE INDEX "Document_organizationId_idx" ON "Document"("organizationId");

-- CreateIndex
CREATE INDEX "EnrollmentProcedure_organizationId_idx" ON "EnrollmentProcedure"("organizationId");

-- CreateIndex
CREATE INDEX "EnrollmentQuota_organizationId_idx" ON "EnrollmentQuota"("organizationId");

-- CreateIndex
CREATE INDEX "EnrollmentSignature_organizationId_idx" ON "EnrollmentSignature"("organizationId");

-- CreateIndex
CREATE INDEX "FormFieldConfig_organizationId_idx" ON "FormFieldConfig"("organizationId");

-- CreateIndex
CREATE INDEX "Homework_organizationId_idx" ON "Homework"("organizationId");

-- CreateIndex
CREATE INDEX "HomeworkSubmission_organizationId_idx" ON "HomeworkSubmission"("organizationId");

-- CreateIndex
CREATE INDEX "InterviewFeedback_organizationId_idx" ON "InterviewFeedback"("organizationId");

-- CreateIndex
CREATE INDEX "Interviewer_organizationId_idx" ON "Interviewer"("organizationId");

-- CreateIndex
CREATE INDEX "LeaveRequest_organizationId_idx" ON "LeaveRequest"("organizationId");

-- CreateIndex
CREATE INDEX "Prospect_organizationId_idx" ON "Prospect"("organizationId");

-- CreateIndex
CREATE INDEX "School_organizationId_idx" ON "School"("organizationId");

-- CreateIndex
CREATE INDEX "SchoolNotice_organizationId_idx" ON "SchoolNotice"("organizationId");

-- CreateIndex
CREATE INDEX "Student_organizationId_idx" ON "Student"("organizationId");

-- CreateIndex
CREATE INDEX "Subject_organizationId_idx" ON "Subject"("organizationId");

-- CreateIndex
CREATE INDEX "SystemSetting_organizationId_idx" ON "SystemSetting"("organizationId");

-- CreateIndex
CREATE INDEX "Teacher_organizationId_idx" ON "Teacher"("organizationId");

-- CreateIndex
CREATE INDEX "Timetable_organizationId_idx" ON "Timetable"("organizationId");

-- CreateIndex
CREATE INDEX "TimetableSlot_organizationId_idx" ON "TimetableSlot"("organizationId");
