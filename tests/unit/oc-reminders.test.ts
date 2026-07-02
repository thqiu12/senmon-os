import { describe, it, expect } from "vitest";
import { selectDueReminders, type EventLite, type ResvLite } from "@/lib/ocReminders";

const NOW = new Date("2026-07-02T03:00:00.000Z"); // JST 2026-07-02 12:00
function ev(id: string, startAt: string): EventLite {
  return { id, title: `EV-${id}`, startAt: new Date(startAt), schoolKey: "sk" };
}
function resv(over: Partial<ResvLite> & { id: string; eventId: string; status: string }): ResvLite {
  return {
    name: "山田", email: "a@example.com", canceledAt: null, createdAt: new Date("2026-06-01T00:00:00Z"),
    reminderSentAt: null, attendedMailSentAt: null, absentMailSentAt: null, unappliedMailSentAt: null,
    ...over,
  };
}

describe("selectDueReminders", () => {
  it("翌日イベント・status=予約 → reminder", () => {
    const events = [ev("e1", "2026-07-03T01:00:00Z")]; // JST 7/3
    const rs = [resv({ id: "r1", eventId: "e1", status: "予約" })];
    const due = selectDueReminders(events, rs, [], NOW);
    expect(due.map((d) => d.kind)).toEqual(["reminder"]);
  });
  it("reminderSentAt 済みは除外", () => {
    const events = [ev("e1", "2026-07-03T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "予約", reminderSentAt: new Date() })];
    expect(selectDueReminders(events, rs, [], NOW)).toEqual([]);
  });
  it("キャンセルは全対象外", () => {
    const events = [ev("e1", "2026-07-03T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "予約", canceledAt: new Date() })];
    expect(selectDueReminders(events, rs, [], NOW)).toEqual([]);
  });
  it("前日終了・status=出席 → attendedApply", () => {
    const events = [ev("e1", "2026-07-01T01:00:00Z")]; // JST 7/1（前日）
    const rs = [resv({ id: "r1", eventId: "e1", status: "出席" })];
    expect(selectDueReminders(events, rs, [], NOW).map((d) => d.kind)).toEqual(["attendedApply"]);
  });
  it("前日終了・status=欠席 → absentFollowup", () => {
    const events = [ev("e1", "2026-07-01T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "欠席" })];
    expect(selectDueReminders(events, rs, [], NOW).map((d) => d.kind)).toEqual(["absentFollowup"]);
  });
  it("7日前終了・出席・未出願 → unappliedFollowup", () => {
    const events = [ev("e1", "2026-06-25T01:00:00Z")]; // JST 6/25（7日前）
    const rs = [resv({ id: "r1", eventId: "e1", status: "出席" })];
    expect(selectDueReminders(events, rs, [], NOW).map((d) => d.kind)).toEqual(["unappliedFollowup"]);
  });
  it("7日前終了・出席だが予約後に出願済み → 除外", () => {
    const events = [ev("e1", "2026-06-25T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "出席", createdAt: new Date("2026-06-20T00:00:00Z") })];
    const applied = [{ email: "a@example.com", createdAt: new Date("2026-06-26T00:00:00Z") }]; // 予約後
    expect(selectDueReminders(events, rs, applied, NOW)).toEqual([]);
  });
  it("出願が予約より前なら未出願扱い（除外しない）", () => {
    const events = [ev("e1", "2026-06-25T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "出席", createdAt: new Date("2026-06-20T00:00:00Z") })];
    const applied = [{ email: "a@example.com", createdAt: new Date("2026-06-10T00:00:00Z") }]; // 予約前
    expect(selectDueReminders(events, rs, applied, NOW).map((d) => d.kind)).toEqual(["unappliedFollowup"]);
  });
  it("該当日でないイベントは何も出さない", () => {
    const events = [ev("e1", "2026-07-10T01:00:00Z")]; // ずっと先
    const rs = [resv({ id: "r1", eventId: "e1", status: "予約" })];
    expect(selectDueReminders(events, rs, [], NOW)).toEqual([]);
  });
});
