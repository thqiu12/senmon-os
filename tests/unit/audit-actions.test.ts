/**
 * 操作ログのキー定数とラベルの健全性を守る。
 * 新しい操作キーを足したらラベルも足す（UI のフィルタ・表示が action キーで動くため）。
 */
import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, auditActionLabel } from "@/lib/auditActions";

describe("auditActions — 操作キーとラベル", () => {
  it("すべての AUDIT_ACTIONS に日本語ラベルがある", () => {
    for (const key of Object.values(AUDIT_ACTIONS)) {
      expect(AUDIT_ACTION_LABELS[key], `ラベル欠落: ${key}`).toBeTruthy();
    }
  });

  it("auditActionLabel は既知キーを日本語化し、未知キーはそのまま返す", () => {
    expect(auditActionLabel(AUDIT_ACTIONS.APPLICATION_DELETE)).toBe("出願を削除");
    expect(auditActionLabel(AUDIT_ACTIONS.APPLICATION_STATUS)).toBe("ステータス変更");
    expect(auditActionLabel("unknown.key")).toBe("unknown.key");
  });
});
