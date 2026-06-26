/**
 * lib/migrateRemoveCommonType.ts の単体テスト。
 * 「共通(applicantType=null)」スコープ廃止移行の純粋ロジックを検証する。
 * - nullRowsToCopyForType: 共通(null)行のうち、対象タイプにまだ無い fieldKey だけコピー対象に返す。
 *   既存のタイプ別行は温存（上書きしない）。
 */
import { describe, it, expect } from "vitest";
import { nullRowsToCopyForType } from "@/lib/migrateRemoveCommonType";

describe("nullRowsToCopyForType", () => {
  it("対象タイプに無い共通行は全てコピー対象", () => {
    const nullRows = [{ fieldKey: "name" }, { fieldKey: "email" }];
    const typeRows: { fieldKey: string }[] = [];
    expect(nullRowsToCopyForType(nullRows, typeRows)).toEqual(nullRows);
  });

  it("対象タイプに既に存在する fieldKey はスキップ（既存のタイプ別行を上書きしない）", () => {
    const nullRows = [{ fieldKey: "name" }, { fieldKey: "email" }];
    const typeRows = [{ fieldKey: "name" }];
    expect(nullRowsToCopyForType(nullRows, typeRows)).toEqual([{ fieldKey: "email" }]);
  });

  it("全ての fieldKey がタイプ側に既存なら 0 件（冪等：再実行で何もコピーしない）", () => {
    const nullRows = [{ fieldKey: "name" }, { fieldKey: "email" }];
    const typeRows = [{ fieldKey: "name" }, { fieldKey: "email" }];
    expect(nullRowsToCopyForType(nullRows, typeRows)).toEqual([]);
  });

  it("共通行が空なら 0 件", () => {
    expect(nullRowsToCopyForType([], [{ fieldKey: "name" }])).toEqual([]);
  });

  it("両方空なら 0 件", () => {
    expect(nullRowsToCopyForType([], [])).toEqual([]);
  });

  it("追加カラムを保持したまま filter する（型透過）", () => {
    const nullRows = [
      { fieldKey: "name", label: "氏名", isRequired: true },
      { fieldKey: "email", label: "メール", isRequired: false },
    ];
    const typeRows = [{ fieldKey: "name" }];
    expect(nullRowsToCopyForType(nullRows, typeRows)).toEqual([
      { fieldKey: "email", label: "メール", isRequired: false },
    ]);
  });
});
