import { describe, it, expect } from "vitest";
import { computeAttribution } from "@/lib/attribution";

const d = (s: string) => new Date(s);

describe("computeAttribution", () => {
  it("源別の出願数・OC予約数・OC転換", () => {
    const apps = [
      { email: "a@x.com", source: "google", createdAt: d("2026-06-20") },
      { email: "b@x.com", source: null, createdAt: d("2026-06-21") },
    ];
    const resv = [
      { email: "A@x.com", source: "google", status: "出席", createdAt: d("2026-06-01") },
      { email: "z@x.com", source: "google", status: "予約", createdAt: d("2026-06-01") },
    ];
    const out = computeAttribution(apps, resv);
    const g = out.find((o) => o.source === "google")!;
    expect(g.applications).toBe(1);
    expect(g.ocReservations).toBe(2);
    expect(g.ocConverted).toBe(1); // a@x matched (出願日>予約日, 大小無視)
    expect(out.find((o) => o.source === "(直接)")!.applications).toBe(1);
  });

  it("source が null/空文字なら (直接) に集計", () => {
    const apps = [
      { email: "a@x.com", source: null, createdAt: d("2026-06-20") },
      { email: "b@x.com", source: "   ", createdAt: d("2026-06-20") },
      { email: "c@x.com", source: undefined, createdAt: d("2026-06-20") },
    ];
    const resv = [{ email: "a@x.com", source: "", status: "予約", createdAt: d("2026-06-19") }];
    const out = computeAttribution(apps, resv);
    const direct = out.find((o) => o.source === "(直接)")!;
    expect(direct.applications).toBe(3);
    expect(direct.ocReservations).toBe(1);
    expect(out.length).toBe(1);
  });

  it("ocConverted は予約日以降に作成された出願のみ計上（予約前の出願は転換に数えない）", () => {
    const apps = [
      { email: "before@x.com", source: "fb", createdAt: d("2026-06-01") }, // 予約より前
      { email: "same@x.com", source: "fb", createdAt: d("2026-06-10") }, // 予約と同日
      { email: "after@x.com", source: "fb", createdAt: d("2026-06-15") }, // 予約より後
    ];
    const resv = [
      { email: "before@x.com", source: "fb", status: "出席", createdAt: d("2026-06-10") },
      { email: "same@x.com", source: "fb", status: "出席", createdAt: d("2026-06-10") },
      { email: "after@x.com", source: "fb", status: "出席", createdAt: d("2026-06-10") },
    ];
    const out = computeAttribution(apps, resv);
    const fb = out.find((o) => o.source === "fb")!;
    expect(fb.ocReservations).toBe(3);
    expect(fb.ocConverted).toBe(2); // same(=) と after(>) のみ、before(<) は除外
  });

  it("メール照合は大文字小文字を無視", () => {
    const apps = [{ email: "  USER@X.COM  ", source: "line", createdAt: d("2026-06-20") }];
    const resv = [{ email: "user@x.com", source: "line", status: "予約", createdAt: d("2026-06-19") }];
    const out = computeAttribution(apps, resv);
    const line = out.find((o) => o.source === "line")!;
    expect(line.ocConverted).toBe(1);
  });

  it("出願数の降順でソート", () => {
    const apps = [
      { email: "a@x.com", source: "small", createdAt: d("2026-06-20") },
      { email: "b@x.com", source: "big", createdAt: d("2026-06-20") },
      { email: "c@x.com", source: "big", createdAt: d("2026-06-20") },
      { email: "d@x.com", source: "big", createdAt: d("2026-06-20") },
    ];
    const out = computeAttribution(apps, []);
    expect(out.map((o) => o.source)).toEqual(["big", "small"]);
    expect(out[0].applications).toBe(3);
  });

  it("ocConvRate は予約0なら0、予約>0なら転換/予約", () => {
    const apps = [{ email: "a@x.com", source: "g", createdAt: d("2026-06-20") }];
    const resv = [
      { email: "a@x.com", source: "g", status: "予約", createdAt: d("2026-06-19") },
      { email: "x@x.com", source: "g", status: "予約", createdAt: d("2026-06-19") },
    ];
    const out = computeAttribution(apps, resv);
    const g = out.find((o) => o.source === "g")!;
    expect(g.ocConvRate).toBeCloseTo(0.5);
    // 予約ゼロの源（出願だけ）は ocConvRate=0
    const apps2 = [{ email: "n@x.com", source: "noresv", createdAt: d("2026-06-20") }];
    expect(computeAttribution(apps2, [])[0].ocConvRate).toBe(0);
  });
});
