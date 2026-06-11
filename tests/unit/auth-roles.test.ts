/**
 * lib/auth.ts のロール権限ゲートの単体テスト。
 * 営業(sales)ロールの権限境界を固定化する：
 *   - isAdmin       … 一般管理機能（営業も可）
 *   - isCoreAdmin   … 出願フォーム編集・選考操作（営業は不可）
 *   - isSuperAdmin  … アカウント管理（super_admin のみ）
 */
import { describe, it, expect } from "vitest";
import { isAdmin, isCoreAdmin, isSuperAdmin, type AdminSession, type AdminRole } from "@/lib/auth";

const sess = (role: AdminRole): AdminSession => ({ userId: "u1", role, isValid: true });

describe("ロール権限ゲート", () => {
  it("isAdmin: super_admin / admin / sales = true、interviewer / null = false", () => {
    expect(isAdmin(sess("super_admin"))).toBe(true);
    expect(isAdmin(sess("admin"))).toBe(true);
    expect(isAdmin(sess("sales"))).toBe(true);
    expect(isAdmin(sess("interviewer"))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("isCoreAdmin（フォーム編集・選考操作）: super_admin / admin のみ。営業は不可", () => {
    expect(isCoreAdmin(sess("super_admin"))).toBe(true);
    expect(isCoreAdmin(sess("admin"))).toBe(true);
    expect(isCoreAdmin(sess("sales"))).toBe(false); // ← 営業は選考操作・フォーム編集不可
    expect(isCoreAdmin(sess("interviewer"))).toBe(false);
    expect(isCoreAdmin(null)).toBe(false);
  });

  it("isSuperAdmin（アカウント管理）: super_admin のみ。営業は不可", () => {
    expect(isSuperAdmin(sess("super_admin"))).toBe(true);
    expect(isSuperAdmin(sess("admin"))).toBe(false);
    expect(isSuperAdmin(sess("sales"))).toBe(false); // ← 営業はアカウント作成不可
    expect(isSuperAdmin(sess("interviewer"))).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });
});
