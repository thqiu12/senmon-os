/**
 * lib/announcement-targeting.ts の単体テスト。
 * お知らせ送信対象フィルター「選考バッチ × 学校 × ステータス」の AND 結合を検証。
 * このビルダーは件数プレビューと実送信の両方で共有されるため、
 * ここでの正しさが「表示件数＝実送信件数」を保証する。
 * 論理削除（ゴミ箱）された出願は常に対象外（deletedAt: null）。
 */
import { describe, it, expect } from "vitest";
import { buildRecipientWhere } from "@/lib/announcement-targeting";

describe("buildRecipientWhere", () => {
  it("フィルタ無し → 削除済みを除く全件", () => {
    expect(buildRecipientWhere({})).toEqual({ deletedAt: null });
  });

  it("合格者プリセット → status in [合格, 補欠合格]", () => {
    expect(buildRecipientWhere({ targetType: "合格者" })).toEqual({
      deletedAt: null,
      status: { in: ["合格", "補欠合格"] },
    });
  });

  it("ステータス単一指定", () => {
    expect(buildRecipientWhere({ targetStatus: "合格" })).toEqual({ deletedAt: null, status: "合格" });
  });

  it("合格者プリセットは targetStatus より優先される", () => {
    expect(buildRecipientWhere({ targetType: "合格者", targetStatus: "受付中" })).toEqual({
      deletedAt: null,
      status: { in: ["合格", "補欠合格"] },
    });
  });

  it("選考バッチ（第N期）で絞り込み", () => {
    expect(buildRecipientWhere({ targetCohortId: "c1" })).toEqual({ deletedAt: null, cohortId: "c1" });
  });

  it("学校は主志望 schoolName または 併願 applicationSchools のいずれかに一致", () => {
    expect(buildRecipientWhere({ targetSchool: "中央ゼミナール" })).toEqual({
      deletedAt: null,
      OR: [
        { schoolName: "中央ゼミナール" },
        { applicationSchools: { some: { schoolName: "中央ゼミナール" } } },
      ],
    });
  });

  it("3軸 AND（第N期 × 学校 × ステータス）", () => {
    expect(
      buildRecipientWhere({
        targetCohortId: "c2",
        targetSchool: "神奈川柔整鍼灸専門学校",
        targetStatus: "合格",
      }),
    ).toEqual({
      deletedAt: null,
      status: "合格",
      cohortId: "c2",
      OR: [
        { schoolName: "神奈川柔整鍼灸専門学校" },
        { applicationSchools: { some: { schoolName: "神奈川柔整鍼灸専門学校" } } },
      ],
    });
  });

  it("合格者プリセット × 学校 の組み合わせ", () => {
    expect(
      buildRecipientWhere({ targetType: "合格者", targetSchool: "中央ゼミナール" }),
    ).toEqual({
      deletedAt: null,
      status: { in: ["合格", "補欠合格"] },
      OR: [
        { schoolName: "中央ゼミナール" },
        { applicationSchools: { some: { schoolName: "中央ゼミナール" } } },
      ],
    });
  });

  it("空文字 / null / undefined は『指定なし』として無視", () => {
    expect(
      buildRecipientWhere({ targetCohortId: "", targetSchool: null, targetStatus: undefined }),
    ).toEqual({ deletedAt: null });
  });
});
