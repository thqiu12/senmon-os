import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatAdsDateTime, buildClickConversion } from "@/lib/googleAds";

describe("formatAdsDateTime", () => {
  it("UTC を JST 壁時計 + '+09:00' に整形する", () => {
    // 2026-07-01T00:30:00Z → JST 09:30:00
    const d = new Date("2026-07-01T00:30:00.000Z");
    expect(formatAdsDateTime(d)).toBe("2026-07-01 09:30:00+09:00");
  });
  it("日付跨ぎ(UTC 前日夜 → JST 翌日)を正しく繰り上げる", () => {
    const d = new Date("2026-06-30T20:00:00.000Z"); // JST 2026-07-01 05:00
    expect(formatAdsDateTime(d)).toBe("2026-07-01 05:00:00+09:00");
  });
});

describe("buildClickConversion", () => {
  it("resource name / gclid / 日時を組む(value 無し)", () => {
    const c = buildClickConversion({
      gclid: "G123",
      conversionActionId: "456",
      customerId: "789",
      conversionDateTime: "2026-07-01 09:30:00+09:00",
    });
    expect(c).toEqual({
      conversionAction: "customers/789/conversionActions/456",
      gclid: "G123",
      conversionDateTime: "2026-07-01 09:30:00+09:00",
    });
  });
  it("value 指定時は conversionValue + currencyCode(既定 JPY)を付ける", () => {
    const c = buildClickConversion({
      gclid: "G1", conversionActionId: "2", customerId: "3",
      conversionDateTime: "2026-07-01 09:30:00+09:00", value: 5000,
    }) as Record<string, unknown>;
    expect(c.conversionValue).toBe(5000);
    expect(c.currencyCode).toBe("JPY");
  });
});

describe("adsEnabled / uploadClickConversion (no-op)", () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("認証情報未設定なら adsEnabled()=false", async () => {
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "");
    const { adsEnabled } = await import("@/lib/googleAds");
    expect(adsEnabled()).toBe(false);
  });

  it("未設定なら uploadClickConversion は fetch を呼ばず {ok:false}", async () => {
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { uploadClickConversion } = await import("@/lib/googleAds");
    const res = await uploadClickConversion({ gclid: "G1", conversionActionId: "2", at: new Date() });
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gclid 空なら enabled でも fetch を呼ばず {ok:false}", async () => {
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "dev");
    vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "sec");
    vi.stubEnv("GOOGLE_ADS_REFRESH_TOKEN", "ref");
    vi.stubEnv("GOOGLE_ADS_CUSTOMER_ID", "123");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { uploadClickConversion } = await import("@/lib/googleAds");
    const res = await uploadClickConversion({ gclid: "", conversionActionId: "2", at: new Date() });
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
