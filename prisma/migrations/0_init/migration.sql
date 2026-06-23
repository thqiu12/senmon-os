-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordVersion" INTEGER NOT NULL DEFAULT 1,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'interviewer',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cohort" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "examDate" TEXT,
    "deadline" TEXT,
    "status" TEXT NOT NULL DEFAULT '受付中',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "round" INTEGER NOT NULL DEFAULT 1,
    "seqCounter" INTEGER NOT NULL DEFAULT 0,
    "schoolKey" TEXT,
    "applySchoolId" TEXT,
    "acceptStart" TIMESTAMP(3),
    "acceptEnd" TIMESTAMP(3),
    "defaultTuitionPlan" TEXT,
    "defaultTuitionAmount" TEXT,
    "defaultTuitionAmount2" TEXT,
    "defaultTuitionDeadline" TEXT,
    "defaultTuitionDeadline2" TEXT,
    "defaultTuitionBankInfo" TEXT,
    "examFeeBankInfo" TEXT,
    "defaultStep2Deadline" TEXT,
    "defaultStep3Deadline" TEXT,
    "examModeTuitionAmounts" TEXT,
    "resultPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interviewer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewFeedback" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "interviewerId" TEXT,
    "interviewerName" TEXT NOT NULL,
    "scoreJapanese" INTEGER,
    "scoreMotivation" INTEGER,
    "scorePersonality" INTEGER,
    "scoreAcademic" INTEGER,
    "scoreOverall" INTEGER,
    "strengths" TEXT,
    "concerns" TEXT,
    "notes" TEXT,
    "recommendation" TEXT NOT NULL DEFAULT '保留',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'all',
    "targetCohortId" TEXT,
    "targetSchool" TEXT,
    "targetStatus" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT '管理者',

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '受付中',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "cohortId" TEXT,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastNameKana" TEXT NOT NULL,
    "firstNameKana" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressDetail" TEXT,
    "residenceStatus" TEXT,
    "residenceExpiry" TEXT,
    "japaneseLevel" TEXT NOT NULL,
    "jlptCertified" BOOLEAN NOT NULL DEFAULT false,
    "schoolName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "course" TEXT,
    "enrollmentYear" TEXT NOT NULL,
    "enrollmentMonth" TEXT NOT NULL,
    "applicationReason" TEXT NOT NULL,
    "applySchoolId" TEXT,
    "applyDepartmentId" TEXT,
    "lastSchoolName" TEXT NOT NULL,
    "lastSchoolCountry" TEXT NOT NULL,
    "lastSchoolGraduate" TEXT NOT NULL,
    "lastSchoolGraduatedOn" TEXT,
    "priorAttendanceRate" TEXT,
    "workExperience" TEXT,
    "interviewDate" TEXT,
    "interviewTime" TEXT,
    "interviewPlace" TEXT,
    "interviewNotes" TEXT,
    "interviewEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "examMode" TEXT NOT NULL DEFAULT '一般',
    "referrerName" TEXT,
    "referrerType" TEXT,
    "examFeeAmount" INTEGER,
    "examFeeStatus" TEXT NOT NULL DEFAULT '未払い',
    "examFeeReceiptUrl" TEXT,
    "examFeeNote" TEXT,
    "resultEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "adminMemo" TEXT,
    "interviewSummary" TEXT,
    "interviewSummaryAt" TIMESTAMP(3),
    "interviewSummaryModel" TEXT,
    "applicantType" TEXT NOT NULL DEFAULT 'foreign',
    "agentId" TEXT,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT '申請中',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "formToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastNameKana" TEXT,
    "firstNameKana" TEXT,
    "birthDate" TEXT,
    "gender" TEXT,
    "nationality" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "intendedSchool" TEXT,
    "intendedDepartment" TEXT,
    "enrollmentYear" TEXT,
    "enrollmentMonth" TEXT,
    "expectedApplyDate" TEXT,
    "agentId" TEXT NOT NULL,
    "agentNotes" TEXT,
    "referredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedApplicationId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "matchedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT '候補',
    "adminMemo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT '提出済',
    "rejectReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "aiExtraction" TEXT,
    "aiExtractedAt" TIMESTAMP(3),
    "aiModel" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNote" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author" TEXT NOT NULL DEFAULT '管理者',
    "visibleToStudent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AdminNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentProcedure" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "instructions" TEXT,
    "deadline" TEXT,
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT '未開始',
    "studentMemo" TEXT,
    "completedAt" TIMESTAMP(3),
    "step1Deadline" TEXT,
    "step2Deadline" TEXT,
    "step3Deadline" TEXT,
    "tuitionPlan" TEXT NOT NULL DEFAULT '全額',
    "tuitionAmount" TEXT,
    "tuitionAmount2" TEXT,
    "tuitionDeadline2" TEXT,
    "tuitionBankInfo" TEXT,
    "tuitionPaid" BOOLEAN NOT NULL DEFAULT false,
    "tuitionPaidAt" TIMESTAMP(3),
    "docChecklist" TEXT,
    "docSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "docSubmittedAt" TIMESTAMP(3),
    "visaStatus" TEXT NOT NULL DEFAULT '未申請',
    "visaNote" TEXT,
    "dormApply" BOOLEAN NOT NULL DEFAULT false,
    "dormStatus" TEXT NOT NULL DEFAULT '未申請',
    "dormNote" TEXT,
    "adminNote" TEXT,
    "schoolConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "schoolConfirmedAt" TIMESTAMP(3),
    "schoolConfirmedBy" TEXT,
    "admitLetterIssued" BOOLEAN NOT NULL DEFAULT false,
    "admitLetterIssuedAt" TIMESTAMP(3),
    "ceremonyNotified" BOOLEAN NOT NULL DEFAULT false,
    "ceremonyDate" TEXT,
    "ceremonyPlace" TEXT,
    "ceremonyNotes" TEXT,
    "visaGuideNotified" BOOLEAN NOT NULL DEFAULT false,
    "visaGuideNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentSignature" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "signatureData" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signerName" TEXT NOT NULL,

    CONSTRAINT "EnrollmentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "hoursPerWeek" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "subjects" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT,
    "applicationId" TEXT,
    "studentNo" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastNameKana" TEXT,
    "firstNameKana" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "nationality" TEXT,
    "birthDate" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graduatedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT '在籍',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timetable" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT,
    "validFrom" TEXT NOT NULL,
    "validTo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Timetable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "timetableSlotId" TEXT,
    "teacherId" TEXT,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '申請中',
    "proofFilePath" TEXT,
    "proofFileName" TEXT,
    "adminNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TEXT NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkSubmission" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "comment" TEXT,
    "score" INTEGER,
    "feedback" TEXT,
    "status" TEXT NOT NULL DEFAULT '未提出',
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "purpose" TEXT,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT '申請中',
    "pdfPath" TEXT,
    "adminNote" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventDate" TEXT NOT NULL,
    "endDate" TEXT,
    "category" TEXT NOT NULL DEFAULT '一般',
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolNotice" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '一般',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT '管理者',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationSchool" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "schoolName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "course" TEXT,
    "enrollmentYear" TEXT NOT NULL,
    "enrollmentMonth" TEXT NOT NULL,
    "result" TEXT,
    "memo" TEXT,
    "interviewDate" TEXT,
    "interviewTime" TEXT,
    "interviewPlace" TEXT,
    "interviewNotes" TEXT,
    "writtenExamDate" TEXT,
    "writtenExamTime" TEXT,
    "writtenExamPlace" TEXT,
    "writtenExamNotes" TEXT,
    "writtenExamExempted" BOOLEAN NOT NULL DEFAULT false,
    "applySchoolId" TEXT,
    "applyDepartmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationSchool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormFieldConfig" (
    "id" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "schoolId" TEXT,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'text',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT NOT NULL DEFAULT '個人情報',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicantType" TEXT,

    CONSTRAINT "FormFieldConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplySchool" (
    "id" TEXT NOT NULL,
    "schoolKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hojin" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'school',
    "description" TEXT,
    "notifyEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "departments" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplySchool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplyDepartment" (
    "id" TEXT NOT NULL,
    "applySchoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration" TEXT NOT NULL DEFAULT '2年制',
    "courses" TEXT NOT NULL DEFAULT '[]',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hasWrittenExam" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplyDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EnrollmentQuota" (
    "id" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "enrollmentYear" TEXT NOT NULL,
    "quota" INTEGER NOT NULL,
    "memo" TEXT,
    "applySchoolId" TEXT,
    "applyDepartmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "summary" TEXT NOT NULL,
    "meta" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Application_applicationNo_key" ON "Application"("applicationNo");

-- CreateIndex
CREATE INDEX "Application_email_idx" ON "Application"("email");

-- CreateIndex
CREATE INDEX "Application_status_createdAt_idx" ON "Application"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Application_cohortId_idx" ON "Application"("cohortId");

-- CreateIndex
CREATE INDEX "Application_agentId_idx" ON "Application"("agentId");

-- CreateIndex
CREATE INDEX "ChangeRequest_applicationId_status_idx" ON "ChangeRequest"("applicationId", "status");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_createdAt_idx" ON "ChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_formToken_key" ON "Agent"("formToken");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_matchedApplicationId_key" ON "Prospect"("matchedApplicationId");

-- CreateIndex
CREATE INDEX "Prospect_agentId_idx" ON "Prospect"("agentId");

-- CreateIndex
CREATE INDEX "Prospect_email_idx" ON "Prospect"("email");

-- CreateIndex
CREATE INDEX "Prospect_lastName_firstName_idx" ON "Prospect"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Prospect_status_createdAt_idx" ON "Prospect"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Document_applicationId_idx" ON "Document"("applicationId");

-- CreateIndex
CREATE INDEX "AdminNote_applicationId_createdAt_idx" ON "AdminNote"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNote_applicationId_visibleToStudent_idx" ON "AdminNote"("applicationId", "visibleToStudent");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentProcedure_applicationId_key" ON "EnrollmentProcedure"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSignature_applicationId_key" ON "EnrollmentSignature"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_applicationId_key" ON "Student"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentNo_key" ON "Student"("studentNo");

-- CreateIndex
CREATE INDEX "Student_schoolId_classId_idx" ON "Student"("schoolId", "classId");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE INDEX "Student_email_idx" ON "Student"("email");

-- CreateIndex
CREATE INDEX "Attendance_studentId_date_idx" ON "Attendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE INDEX "Attendance_subjectId_date_idx" ON "Attendance"("subjectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_timetableSlotId_date_key" ON "Attendance"("studentId", "timetableSlotId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkSubmission_homeworkId_studentId_key" ON "HomeworkSubmission"("homeworkId", "studentId");

-- CreateIndex
CREATE INDEX "ChatMessage_studentId_createdAt_idx" ON "ChatMessage"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationSchool_applySchoolId_idx" ON "ApplicationSchool"("applySchoolId");

-- CreateIndex
CREATE INDEX "ApplicationSchool_applyDepartmentId_idx" ON "ApplicationSchool"("applyDepartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationSchool_applicationId_priority_key" ON "ApplicationSchool"("applicationId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "FormFieldConfig_fieldKey_schoolId_applicantType_key" ON "FormFieldConfig"("fieldKey", "schoolId", "applicantType");

-- CreateIndex
CREATE UNIQUE INDEX "ApplySchool_schoolKey_key" ON "ApplySchool"("schoolKey");

-- CreateIndex
CREATE INDEX "ApplyDepartment_applySchoolId_idx" ON "ApplyDepartment"("applySchoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplyDepartment_applySchoolId_name_key" ON "ApplyDepartment"("applySchoolId", "name");

-- CreateIndex
CREATE INDEX "EnrollmentQuota_applySchoolId_idx" ON "EnrollmentQuota"("applySchoolId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentQuota_schoolName_department_enrollmentYear_key" ON "EnrollmentQuota"("schoolName", "department", "enrollmentYear");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentQuota_applySchoolId_applyDepartmentId_enrollmentY_key" ON "EnrollmentQuota"("applySchoolId", "applyDepartmentId", "enrollmentYear");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_applySchoolId_fkey" FOREIGN KEY ("applySchoolId") REFERENCES "ApplySchool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Interviewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_applySchoolId_fkey" FOREIGN KEY ("applySchoolId") REFERENCES "ApplySchool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_applyDepartmentId_fkey" FOREIGN KEY ("applyDepartmentId") REFERENCES "ApplyDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentProcedure" ADD CONSTRAINT "EnrollmentProcedure_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentSignature" ADD CONSTRAINT "EnrollmentSignature_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timetable" ADD CONSTRAINT "Timetable_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timetable" ADD CONSTRAINT "Timetable_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "Timetable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_timetableSlotId_fkey" FOREIGN KEY ("timetableSlotId") REFERENCES "TimetableSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolNotice" ADD CONSTRAINT "SchoolNotice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationSchool" ADD CONSTRAINT "ApplicationSchool_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationSchool" ADD CONSTRAINT "ApplicationSchool_applySchoolId_fkey" FOREIGN KEY ("applySchoolId") REFERENCES "ApplySchool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationSchool" ADD CONSTRAINT "ApplicationSchool_applyDepartmentId_fkey" FOREIGN KEY ("applyDepartmentId") REFERENCES "ApplyDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplyDepartment" ADD CONSTRAINT "ApplyDepartment_applySchoolId_fkey" FOREIGN KEY ("applySchoolId") REFERENCES "ApplySchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentQuota" ADD CONSTRAINT "EnrollmentQuota_applySchoolId_fkey" FOREIGN KEY ("applySchoolId") REFERENCES "ApplySchool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentQuota" ADD CONSTRAINT "EnrollmentQuota_applyDepartmentId_fkey" FOREIGN KEY ("applyDepartmentId") REFERENCES "ApplyDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

