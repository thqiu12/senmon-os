/**
 * OC自動メール日次バッチ（前日リマインド/出席御礼＋出願案内/欠席フォロー/未出願フォロー）。
 * 使い方（VPS crontab で日次）:
 *   DATABASE_URL=... RESEND_API_KEY=... RESEND_FROM=... NEXT_PUBLIC_BASE_URL=... \
 *   npx tsx scripts/oc-send-reminders.ts
 *   （--dry-run で送信せず対象件数のみ表示）
 * RESEND 未設定なら sendEmail が no-op を返し、フラグは立てない（後で設定後に送れる）。
 */
import { PrismaClient } from "@prisma/client";
import { selectDueReminders, FLAG_COLUMN, type EventLite, type ResvLite, type DueKind } from "@/lib/ocReminders";
import { parseTemplates, renderTemplate, OC_EMAIL_SETTING_KEY, type OCEmailKey } from "@/lib/ocEmailTemplates";
import { sendEmail } from "@/lib/email";
import { formatDateTimeJP } from "@/lib/utils";
import { ENV } from "@/lib/env";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const prisma = new PrismaClient();
  const now = new Date();
  const from = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  try {
    const events = await prisma.oCEvent.findMany({
      where: { startAt: { gte: from, lte: to } },
      select: { id: true, title: true, startAt: true, schoolKey: true },
    });
    if (events.length === 0) {
      console.log("[oc-mail] 対象期間のイベントなし。終了。");
      return;
    }
    const eventIds = events.map((e) => e.id);
    const reservations = await prisma.oCReservation.findMany({
      where: { ocEventId: { in: eventIds } },
      select: {
        id: true, ocEventId: true, name: true, email: true, status: true, canceledAt: true, createdAt: true,
        reservationNo: true,
        reminderSentAt: true, attendedMailSentAt: true, absentMailSentAt: true, unappliedMailSentAt: true,
      },
    });
    const resNoById = new Map(reservations.map((r) => [r.id, r.reservationNo]));
    const emails = Array.from(new Set(reservations.map((r) => r.email)));
    const applied = emails.length
      ? await prisma.application.findMany({ where: { email: { in: emails } }, select: { email: true, createdAt: true } })
      : [];

    const eventsLite: EventLite[] = events.map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, schoolKey: e.schoolKey }));
    const resvLite: ResvLite[] = reservations.map((r) => ({ ...r, eventId: r.ocEventId }));

    const due = selectDueReminders(eventsLite, resvLite, applied, now);
    if (due.length === 0) {
      console.log("[oc-mail] 送信対象なし。終了。");
      return;
    }

    // テンプレ（SystemSetting）と学校名 Map
    const setting = await prisma.systemSetting.findFirst({ where: { key: OC_EMAIL_SETTING_KEY } });
    const templates = parseTemplates(setting?.value ?? null);
    const schools = await prisma.applySchool.findMany({ select: { schoolKey: true, name: true } });
    const schoolName = new Map(schools.map((s) => [s.schoolKey, s.name]));
    const base = ENV.PUBLIC_BASE_URL || "";

    const counts: Record<DueKind, { sent: number; skipped: number; failed: number }> = {
      reminder: { sent: 0, skipped: 0, failed: 0 },
      attendedApply: { sent: 0, skipped: 0, failed: 0 },
      absentFollowup: { sent: 0, skipped: 0, failed: 0 },
      unappliedFollowup: { sent: 0, skipped: 0, failed: 0 },
    };

    for (const item of due) {
      const key = item.kind as OCEmailKey;
      const tpl = templates[key];
      if (!tpl.enabled) { counts[item.kind].skipped++; continue; }

      const r = item.reservation;
      const e = item.event;
      const sName = schoolName.get(e.schoolKey) || e.schoolKey;
      const applyUrl = `${base}/apply?school=${encodeURIComponent(e.schoolKey)}&utm_source=oc&utm_medium=email&utm_campaign=oc_followup`;
      const cancelUrl = `${base}/oc/status?reservationNo=${encodeURIComponent(resNoById.get(r.id) || "")}&email=${encodeURIComponent(r.email)}`;
      const vars: Record<string, string> = {
        name: r.name,
        eventTitle: e.title,
        startAt: formatDateTimeJP(e.startAt),
        schoolName: sName,
        applyUrl,
        cancelUrl,
      };
      const subject = renderTemplate(tpl.subject, vars);
      const text = renderTemplate(tpl.body, vars);

      if (dryRun) { counts[item.kind].sent++; continue; }

      const result = await sendEmail({ to: r.email, subject, text });
      if (result.ok) {
        const col = FLAG_COLUMN[item.kind];
        await prisma.oCReservation.update({ where: { id: r.id }, data: { [col]: new Date() } });
        counts[item.kind].sent++;
      } else {
        counts[item.kind].failed++;
      }
    }

    console.log(`[oc-mail] ${dryRun ? "(dry-run) " : ""}完了:`, JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error("[oc-mail] 予期せぬエラー:", e); process.exit(1); });
