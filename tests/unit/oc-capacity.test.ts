import { describe, it, expect } from "vitest";
import { usedSeats, remainingSeats, canReserve } from "@/lib/ocCapacity";

const r = (attendees: number, status = "予約") => ({ attendees, status });

describe("ocCapacity", () => {
  it("usedSeats は予約/出席のみ合計", () => {
    expect(usedSeats([r(2), r(1, "出席"), r(3, "キャンセル"), r(1, "欠席")])).toBe(3);
  });
  it("remainingSeats は0で下げ止まり", () => {
    expect(remainingSeats(5, [r(2)])).toBe(3);
    expect(remainingSeats(2, [r(2), r(2)])).toBe(0);
  });
  it("canReserve: 収まる=true / 超過=false / 0以下=false", () => {
    expect(canReserve(5, [r(2)], 3)).toBe(true);
    expect(canReserve(5, [r(2)], 4)).toBe(false);
    expect(canReserve(5, [], 0)).toBe(false);
  });
});
