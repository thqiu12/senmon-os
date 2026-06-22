/**
 * 学科ごとの筆記有無（hasWrittenExam）を加味した免除判定。
 * 学科フラグが最優先、未設定は学校名フォールバック（TDB 等の後方互換）。
 */
import { describe, it, expect } from "vitest";
import { isWrittenExamExempt, isNoWrittenExamSchool } from "@/lib/examConfig";

describe("isWrittenExamExempt — 学科の筆記有無", () => {
  it("学科 hasWrittenExam=false は免除", () => {
    expect(isWrittenExamExempt({ hasWrittenExam: false, schoolName: "中央ゼミナール" })).toBe(true);
  });

  it("学科 hasWrittenExam=true は免除でない（一般校）", () => {
    expect(isWrittenExamExempt({ hasWrittenExam: true, schoolName: "中央ゼミナール" })).toBe(false);
  });

  it("未設定(undefined)は学校名フォールバック：TDBは免除・中央ゼミは免除でない", () => {
    expect(isWrittenExamExempt({ schoolName: "東京デジタルビジネス専門学校" })).toBe(true);
    expect(isWrittenExamExempt({ schoolName: "中央ゼミナール" })).toBe(false);
  });

  it("TDBは学科未設定でも従来どおり免除（後方互換）", () => {
    expect(isNoWrittenExamSchool({ schoolId: "tdb" })).toBe(true);
  });
});
