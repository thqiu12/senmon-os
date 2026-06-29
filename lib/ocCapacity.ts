type Resv = { attendees: number; status: string };
const ACTIVE = new Set(["予約", "出席"]);
/** 有効予約の参加人数合計。 */
export function usedSeats(reservations: Resv[]): number {
  return reservations.filter((r) => ACTIVE.has(r.status)).reduce((s, r) => s + (r.attendees || 0), 0);
}
/** 残席（capacity 上限）。 */
export function remainingSeats(capacity: number, reservations: Resv[]): number {
  return Math.max(0, capacity - usedSeats(reservations));
}
/** 今回 attendees 名が入れるか。 */
export function canReserve(capacity: number, reservations: Resv[], attendees: number): boolean {
  return attendees > 0 && usedSeats(reservations) + attendees <= capacity;
}
