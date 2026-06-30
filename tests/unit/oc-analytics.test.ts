import { describe, it, expect } from "vitest";
import { computeOCAnalytics } from "@/lib/ocAnalytics";

const d = (s: string) => new Date(s);
const r = (p: Partial<any> = {}) => ({
  ocEventId: "e1",
  status: "予約",
  email: "x@a.com",
  attendees: 1,
  source: null,
  utmCampaign: null,
  createdAt: d("2026-06-01"),
  ...p,
});

describe("computeOCAnalytics", () => {
  it("出席率は出席/(出席+欠席)、キャンセル率はキャンセル/total", () => {
    const out = computeOCAnalytics(
      [r({ status: "出席" }), r({ status: "欠席" }), r({ status: "予約" }), r({ status: "キャンセル" })],
      [],
    );
    expect(out.summary.attendanceRate).toBeCloseTo(0.5);
    expect(out.summary.cancellationRate).toBeCloseTo(0.25);
    expect(out.byStatus["出席"]).toBe(1);
    expect(out.byStatus["欠席"]).toBe(1);
    expect(out.byStatus["予約"]).toBe(1);
    expect(out.byStatus["キャンセル"]).toBe(1);
    expect(out.summary.reservations).toBe(4);
  });

  it("attendeesTotal は予約/出席のみ合算する", () => {
    const out = computeOCAnalytics(
      [
        r({ status: "出席", attendees: 2 }),
        r({ status: "予約", attendees: 3 }),
        r({ status: "欠席", attendees: 5 }),
        r({ status: "キャンセル", attendees: 5 }),
      ],
      [],
    );
    expect(out.summary.attendeesTotal).toBe(5);
  });

  it("転換=同メール&出願日≥予約日、大小無視", () => {
    const out = computeOCAnalytics(
      [r({ email: "A@x.com", createdAt: d("2026-06-01") })],
      [{ email: "a@x.com", createdAt: d("2026-06-10") }],
    );
    expect(out.conversion.convReserved).toBe(1);

    const out2 = computeOCAnalytics(
      [r({ createdAt: d("2026-06-10") })],
      [{ email: "x@a.com", createdAt: d("2026-06-01") }],
    );
    expect(out2.conversion.convReserved).toBe(0); // 出願が予約より前

    const out3 = computeOCAnalytics(
      [r({ email: "noapp@x.com" })],
      [{ email: "other@x.com", createdAt: d("2026-06-10") }],
    );
    expect(out3.conversion.convReserved).toBe(0); // メール無し
  });

  it("attendedToApplied は出席かつ転換した割合", () => {
    const out = computeOCAnalytics(
      [
        r({ status: "出席", email: "a@x.com", createdAt: d("2026-06-01") }),
        r({ status: "出席", email: "b@x.com", createdAt: d("2026-06-01") }),
      ],
      [{ email: "a@x.com", createdAt: d("2026-06-05") }],
    );
    expect(out.conversion.convAttended).toBe(1);
    expect(out.conversion.attendedToApplied).toBeCloseTo(0.5);
  });

  it("流入元別(直接含む)", () => {
    const out = computeOCAnalytics([r({ source: "google" }), r({ source: null })], []);
    expect(out.bySource.find((s) => s.source === "google")!.reservations).toBe(1);
    expect(out.bySource.find((s) => s.source === "(直接)")!.reservations).toBe(1);
  });

  it("流入元別の転換率", () => {
    const out = computeOCAnalytics(
      [
        r({ source: "google", email: "a@x.com", createdAt: d("2026-06-01") }),
        r({ source: "google", email: "b@x.com", createdAt: d("2026-06-01") }),
      ],
      [{ email: "a@x.com", createdAt: d("2026-06-05") }],
    );
    const g = out.bySource.find((s) => s.source === "google")!;
    expect(g.reservations).toBe(2);
    expect(g.converted).toBe(1);
    expect(g.rate).toBeCloseTo(0.5);
  });

  it("イベント別 remaining と件数", () => {
    const out = computeOCAnalytics(
      [r({ ocEventId: "e1", status: "出席", attendees: 2 })],
      [],
      [{ id: "e1", title: "OC", startAt: d("2026-06-15"), capacity: 5, schoolKey: "s" }],
    );
    const e = out.byEvent.find((x) => x.eventId === "e1")!;
    expect(e.出席).toBe(1);
    expect(e.remaining).toBe(3);
    expect(e.title).toBe("OC");
    expect(e.capacity).toBe(5);
  });

  it("イベント別 status集計・convRate", () => {
    const out = computeOCAnalytics(
      [
        r({ ocEventId: "e1", status: "出席", email: "a@x.com", createdAt: d("2026-06-01") }),
        r({ ocEventId: "e1", status: "欠席", email: "b@x.com", createdAt: d("2026-06-01") }),
        r({ ocEventId: "e1", status: "キャンセル", email: "c@x.com", createdAt: d("2026-06-01") }),
        r({ ocEventId: "e1", status: "予約", email: "d@x.com", createdAt: d("2026-06-01") }),
      ],
      [{ email: "a@x.com", createdAt: d("2026-06-05") }],
      [{ id: "e1", title: "OC", startAt: d("2026-06-15"), capacity: 10, schoolKey: "s" }],
    );
    const e = out.byEvent.find((x) => x.eventId === "e1")!;
    expect(e.出席).toBe(1);
    expect(e.欠席).toBe(1);
    expect(e.キャンセル).toBe(1);
    expect(e.予約).toBe(1);
    expect(e.converted).toBe(1);
    expect(e.convRate).toBeCloseTo(0.25);
  });
});
