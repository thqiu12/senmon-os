export type AnalyticsReservation = {
  ocEventId: string; status: string; email: string; attendees: number;
  source?: string | null; utmCampaign?: string | null; createdAt: Date;
};
export type AppEmail = { email: string; createdAt: Date };
export type AnalyticsEvent = { id: string; title: string; startAt: Date; capacity: number; schoolKey: string };

const norm = (e: string) => e.trim().toLowerCase();
const ACTIVE = new Set(["予約", "出席"]);

function appEmailMap(apps: AppEmail[]): Map<string, Date> {
  const m = new Map<string, Date>();
  for (const a of apps) {
    if (!a.email) continue;
    const k = norm(a.email);
    const cur = m.get(k);
    if (!cur || a.createdAt < cur) m.set(k, a.createdAt);
  }
  return m;
}
function converted(r: AnalyticsReservation, appMap: Map<string, Date>): boolean {
  const d = appMap.get(norm(r.email));
  return !!d && d >= r.createdAt;
}

export function computeOCAnalytics(
  reservations: AnalyticsReservation[],
  apps: AppEmail[],
  events: AnalyticsEvent[] = [],
) {
  const appMap = appEmailMap(apps);
  const byStatus: Record<string, number> = { 予約: 0, 出席: 0, 欠席: 0, キャンセル: 0 };
  let attendeesTotal = 0, convReserved = 0, attended = 0, convAttended = 0;
  for (const r of reservations) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (ACTIVE.has(r.status)) attendeesTotal += r.attendees || 0;
    if (converted(r, appMap)) convReserved++;
    if (r.status === "出席") { attended++; if (converted(r, appMap)) convAttended++; }
  }
  const total = reservations.length;
  const attendedCnt = byStatus["出席"], absent = byStatus["欠席"], canceled = byStatus["キャンセル"];
  const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

  const srcMap = new Map<string, { source: string; reservations: number; converted: number }>();
  for (const r of reservations) {
    const s = (r.source && r.source.trim()) || "(直接)";
    const e = srcMap.get(s) ?? { source: s, reservations: 0, converted: 0 };
    e.reservations++; if (converted(r, appMap)) e.converted++;
    srcMap.set(s, e);
  }
  const evMap = new Map(events.map(e => [e.id, e]));
  type EvAgg = { eventId: string; title: string; startAt: Date; capacity: number; 予約: number; 出席: number; 欠席: number; キャンセル: number; used: number; converted: number };
  const byEventAgg = new Map<string, EvAgg>();
  for (const r of reservations) {
    const ev = evMap.get(r.ocEventId);
    const cur: EvAgg = byEventAgg.get(r.ocEventId) ?? { eventId: r.ocEventId, title: ev?.title ?? r.ocEventId, startAt: ev?.startAt ?? new Date(0), capacity: ev?.capacity ?? 0, 予約: 0, 出席: 0, 欠席: 0, キャンセル: 0, used: 0, converted: 0 };
    (cur as any)[r.status] = ((cur as any)[r.status] ?? 0) + 1;
    if (ACTIVE.has(r.status)) cur.used += r.attendees || 0;
    if (converted(r, appMap)) cur.converted++;
    byEventAgg.set(r.ocEventId, cur);
  }
  return {
    summary: { reservations: total, attendeesTotal, attendanceRate: rate(attendedCnt, attendedCnt + absent), cancellationRate: rate(canceled, total) },
    byStatus,
    conversion: { reservedToApplied: rate(convReserved, total), attendedToApplied: rate(convAttended, attended), convReserved, convAttended },
    bySource: Array.from(srcMap.values()).map(s => ({ ...s, rate: rate(s.converted, s.reservations) })).sort((a, b) => b.reservations - a.reservations),
    byEvent: Array.from(byEventAgg.values()).map(e => ({ ...e, remaining: Math.max(0, e.capacity - e.used), convRate: rate(e.converted, e.予約 + e.出席 + e.欠席 + e.キャンセル) })).sort((a, b) => b.startAt.getTime() - a.startAt.getTime()),
  };
}
