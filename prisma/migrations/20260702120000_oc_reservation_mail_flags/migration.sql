ALTER TABLE "OCReservation" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "OCReservation" ADD COLUMN "attendedMailSentAt" TIMESTAMP(3);
ALTER TABLE "OCReservation" ADD COLUMN "absentMailSentAt" TIMESTAMP(3);
ALTER TABLE "OCReservation" ADD COLUMN "unappliedMailSentAt" TIMESTAMP(3);
