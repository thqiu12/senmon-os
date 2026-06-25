/**
 * lib/migrateRemoveCommon.ts の単体テスト。
 * 「全校共通」スコープ廃止移行の純粋ロジックを検証する。
 * - rowsToCopyForSchool: グローバル行の各校コピー対象判定（既存の学校別上書きは温存）。
 * - expandGlobalPayment: __global__ を各校へ展開し __global__ を削除（冪等）。
 */
import { describe, it, expect } from "vitest";
import { rowsToCopyForSchool, expandGlobalPayment } from "@/lib/migrateRemoveCommon";

describe("rowsToCopyForSchool", () => {
  it("学校に無いグローバル行は全てコピー対象", () => {
    const global = [
      { fieldKey: "name", applicantType: null },
      { fieldKey: "email", applicantType: "japanese" },
    ];
    const result = rowsToCopyForSchool(global, []);
    expect(result).toEqual(global);
  });

  it("学校が同じ (fieldKey, applicantType) を持つ行はスキップ", () => {
    const global = [
      { fieldKey: "name", applicantType: null },
      { fieldKey: "email", applicantType: null },
    ];
    const school = [{ fieldKey: "name", applicantType: null }];
    const result = rowsToCopyForSchool(global, school);
    expect(result).toEqual([{ fieldKey: "email", applicantType: null }]);
  });

  it("applicantType の null と type は別物として扱う（null だけ持っていても type 行はコピー）", () => {
    const global = [
      { fieldKey: "name", applicantType: null },
      { fieldKey: "name", applicantType: "japanese" },
      { fieldKey: "name", applicantType: "foreign" },
    ];
    const school = [{ fieldKey: "name", applicantType: null }];
    const result = rowsToCopyForSchool(global, school);
    expect(result).toEqual([
      { fieldKey: "name", applicantType: "japanese" },
      { fieldKey: "name", applicantType: "foreign" },
    ]);
  });

  it("追加カラムを保持したまま filter する（型透過）", () => {
    const global = [
      { fieldKey: "name", applicantType: null, label: "氏名", isRequired: true },
    ];
    const result = rowsToCopyForSchool(global, []);
    expect(result[0]).toEqual({ fieldKey: "name", applicantType: null, label: "氏名", isRequired: true });
  });

  it("グローバル行が空なら 0 件（冪等：再実行で何もコピーしない）", () => {
    expect(rowsToCopyForSchool([], [{ fieldKey: "name", applicantType: null }])).toEqual([]);
  });
});

const GLOBAL_KEY = "__global__";

describe("expandGlobalPayment", () => {
  const g = { examFee: { bankInfo: "G-EX", qr: null }, tuition: { bankInfo: "G-TU", qr: null } };

  it("未設定の学校に __global__ を埋め、__global__ は削除", () => {
    const map = { [GLOBAL_KEY]: g };
    const out = expandGlobalPayment(map, ["a", "b"], GLOBAL_KEY);
    expect(out).toEqual({ a: g, b: g });
    expect(out[GLOBAL_KEY]).toBeUndefined();
  });

  it("既存の学校設定は上書きしない", () => {
    const own = { examFee: { bankInfo: "A-EX", qr: null }, tuition: { bankInfo: "A-TU", qr: null } };
    const map = { a: own, [GLOBAL_KEY]: g };
    const out = expandGlobalPayment(map, ["a", "b"], GLOBAL_KEY);
    expect(out.a).toBe(own);
    expect(out.b).toEqual(g);
    expect(out[GLOBAL_KEY]).toBeUndefined();
  });

  it("__global__ が無ければ展開せず（冪等：再実行 no-op）", () => {
    const own = { examFee: { bankInfo: "A-EX", qr: null }, tuition: { bankInfo: "A-TU", qr: null } };
    const map = { a: own };
    const out = expandGlobalPayment(map, ["a", "b"], GLOBAL_KEY);
    expect(out).toEqual({ a: own });
    expect(out.b).toBeUndefined();
  });

  it("入力 map を破壊的に変更しない", () => {
    const map = { [GLOBAL_KEY]: g };
    expandGlobalPayment(map, ["a"], GLOBAL_KEY);
    expect(map[GLOBAL_KEY]).toBe(g);
  });
});
