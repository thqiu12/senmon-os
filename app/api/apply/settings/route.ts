import { NextResponse } from "next/server";
import { getEnrollmentYears, getSetting } from "@/lib/settings";

/**
 * 出願フォーム用の公開設定エンドポイント。
 * 認証不要。学生がアクセスする apply ページがドロップダウン項目を読み取るために使う。
 */
export async function GET() {
  try {
    const [enrollmentYears, enrollmentMonth] = await Promise.all([
      getEnrollmentYears(),
      getSetting("enrollmentMonth"),
    ]);
    return NextResponse.json(
      { enrollmentYears, enrollmentMonth },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // 失敗時もフォームを止めないように既定値を返す
    const y = new Date().getFullYear();
    return NextResponse.json({
      enrollmentYears: [String(y), String(y + 1), String(y + 2)],
      enrollmentMonth: "4",
    });
  }
}
