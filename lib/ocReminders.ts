// OC自動メールの対象抽出（純関数）。JST の暦日差でメール種別を判定する。
export type DueKind = "reminder" | "attendedApply" | "absentFollowup" | "unappliedFollowup";

export type EventLite = { id: string; title: string; startAt: Date; schoolKey: string };
export type ResvLite = {
  id: string;
  eventId: string;
  name: string;
  email: string;
  status: string; // 予約/出席/欠席/キャンセル
  canceledAt: Date | null;
  createdAt: Date;
  reminderSentAt: Date | null;
  attendedMailSentAt: Date | null;
  absentMailSentAt: Date | null;
  unappliedMailSentAt: Date | null;
};
export type AppliedEmail = { email: string; createdAt: Date };
export type DueItem = { kind: DueKind; reservation: ResvLite; event: EventLite };

// +9h した時刻を UTC で読むと JST 壁時計。86,400,000ms で割った整数＝JST 暦日インデックス。
function jstDayNumber(d: Date): number {
  return Math.floor((d.getTime() + 9 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000));
}

export function selectDueReminders(
  events: EventLite[],
  reservations: ResvLite[],
  appliedEmails: AppliedEmail[],
  now: Date,
): DueItem[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const nowDay = jstDayNumber(now);

  const appliedByEmail = new Map<string, Date[]>();
  for (const a of appliedEmails) {
    const key = a.email.toLowerCase();
    const arr = appliedByEmail.get(key);
    if (arr) arr.push(a.createdAt);
    else appliedByEmail.set(key, [a.createdAt]);
  }

  const out: DueItem[] = [];
  for (const r of reservations) {
    if (r.canceledAt) continue;
    const event = eventById.get(r.eventId);
    if (!event) continue;
    const diff = jstDayNumber(event.startAt) - nowDay;

    if (r.status === "予約" && diff === 1 && !r.reminderSentAt) {
      out.push({ kind: "reminder", reservation: r, event });
    } else if (r.status === "出席" && diff === -1 && !r.attendedMailSentAt) {
      out.push({ kind: "attendedApply", reservation: r, event });
    } else if (r.status === "欠席" && diff === -1 && !r.absentMailSentAt) {
      out.push({ kind: "absentFollowup", reservation: r, event });
    } else if (r.status === "出席" && diff === -7 && !r.unappliedMailSentAt) {
      const applieds = appliedByEmail.get(r.email.toLowerCase()) ?? [];
      const appliedAfterReservation = applieds.some((d) => d.getTime() >= r.createdAt.getTime());
      if (!appliedAfterReservation) out.push({ kind: "unappliedFollowup", reservation: r, event });
    }
  }
  return out;
}

// kind → OCReservation の送信済みフラグ列名（cron が stamp に使う）。
export const FLAG_COLUMN: Record<DueKind, "reminderSentAt" | "attendedMailSentAt" | "absentMailSentAt" | "unappliedMailSentAt"> = {
  reminder: "reminderSentAt",
  attendedApply: "attendedMailSentAt",
  absentFollowup: "absentMailSentAt",
  unappliedFollowup: "unappliedMailSentAt",
};
