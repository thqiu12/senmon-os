CREATE TABLE "OCEvent" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT, "schoolKey" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3),
  "capacity" INTEGER NOT NULL, "location" TEXT, "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "onlineUrl" TEXT, "status" TEXT NOT NULL DEFAULT '下書き',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "OCEvent_organizationId_idx" ON "OCEvent"("organizationId");
CREATE INDEX "OCEvent_schoolKey_status_startAt_idx" ON "OCEvent"("schoolKey","status","startAt");

CREATE TABLE "OCReservation" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT, "ocEventId" TEXT NOT NULL,
  "reservationNo" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT,
  "attendees" INTEGER NOT NULL DEFAULT 1, "extraData" JSONB, "status" TEXT NOT NULL DEFAULT '予約',
  "source" TEXT, "utmCampaign" TEXT, "utmMedium" TEXT, "gclid" TEXT, "referrer" TEXT, "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OCReservation_ocEventId_fkey" FOREIGN KEY ("ocEventId") REFERENCES "OCEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OCReservation_reservationNo_key" ON "OCReservation"("reservationNo");
CREATE INDEX "OCReservation_organizationId_idx" ON "OCReservation"("organizationId");
CREATE INDEX "OCReservation_ocEventId_status_idx" ON "OCReservation"("ocEventId","status");
CREATE INDEX "OCReservation_email_idx" ON "OCReservation"("email");

ALTER TABLE "FormFieldConfig" ADD COLUMN "formType" TEXT NOT NULL DEFAULT 'apply';
DROP INDEX IF EXISTS "FormFieldConfig_fieldKey_schoolId_applicantType_key";
CREATE UNIQUE INDEX "FormFieldConfig_fieldKey_schoolId_applicantType_formType_key" ON "FormFieldConfig"("fieldKey","schoolId","applicantType","formType");
