/**
 * ダッシュボードの「進行中」カード ↔ 一覧/エクスポートの絞り込みの一致を守る。
 *
 * 不具合: 「進行中」カードの数字は (受付中 + 書類確認中 + 面接待ち) の合計なのに、
 * クリック時は単一「面接待ち」で絞り込んでいたため、数字が1でも一覧は0件になった。
 * statusWhere("進行中") をカードと同じ3ステータスの IN 展開にして一致させる。
 */
import { describe, it, expect } from "vitest";
import { statusWhere, IN_PROGRESS_STATUSES, IN_PROGRESS_FILTER } from "@/lib/schemas";

describe("statusWhere — 一覧/エクスポートの status 絞り込み", () => {
  it("進行中 はカードと同じ3ステータスの IN に展開する", () => {
    expect(statusWhere(IN_PROGRESS_FILTER)).toEqual({ in: [...IN_PROGRESS_STATUSES] });
  });

  it("IN_PROGRESS_STATUSES は 受付中・書類確認中・面接待ち（カードの数字と同一集合）", () => {
    expect([...IN_PROGRESS_STATUSES]).toEqual(["受付中", "書類確認中", "面接待ち"]);
  });

  it("単一ステータスは完全一致のまま（例: 面接待ち・合格）", () => {
    expect(statusWhere("面接待ち")).toBe("面接待ち");
    expect(statusWhere("合格")).toBe("合格");
  });

  it("all / 空 / null / undefined は絞り込みなし(undefined)", () => {
    expect(statusWhere("all")).toBeUndefined();
    expect(statusWhere("")).toBeUndefined();
    expect(statusWhere(null)).toBeUndefined();
    expect(statusWhere(undefined)).toBeUndefined();
  });
});
