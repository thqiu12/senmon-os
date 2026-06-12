import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 受験料の振込先。?schoolKey= があれば、その学校の受付中コホートに設定された
// examFeeBankInfo（選考管理で入力）を優先して返す。未設定なら環境変数の既定値。
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const schoolKey = searchParams.get("schoolKey");

  let bankInfoText: string | null = null;
  try {
    const cohorts = await prisma.cohort.findMany({
      where: schoolKey
        ? { status: "受付中", OR: [{ schoolKey }, { schoolKey: null }] }
        : { status: "受付中" },
      select: { schoolKey: true, examFeeBankInfo: true },
    });
    const specific = cohorts.find((c) => c.schoolKey === schoolKey && c.examFeeBankInfo);
    const global = cohorts.find((c) => !c.schoolKey && c.examFeeBankInfo);
    bankInfoText = (specific?.examFeeBankInfo || global?.examFeeBankInfo) ?? null;
  } catch {
    /* DB未接続などのときは環境変数の既定値にフォールバック */
  }

  return NextResponse.json({
    bankName: process.env.PAYMENT_BANK_NAME || "三菱UFJ銀行 新宿支店",
    accountType: process.env.PAYMENT_ACCOUNT_TYPE || "普通",
    accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || "1234567",
    accountHolder: process.env.PAYMENT_ACCOUNT_HOLDER || "（ザ）ハバガクエン",
    deadline: process.env.PAYMENT_DEADLINE || "出願後7日以内",
    bankInfoText, // 選考管理で設定された受験料振込先（あれば優先表示）
  });
}
