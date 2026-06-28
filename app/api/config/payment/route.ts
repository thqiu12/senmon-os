import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { PAYMENT_CONFIG_KEY, parsePaymentMap, resolvePayment, emptyConfig } from "@/lib/paymentConfig";

// 受験料・学費の振込先＋QR。?schoolKey= があれば学校別設定を解決（全校共通フォールバックなし）。
// 受験料の振込先テキストは「支払い設定 > 選考管理(#7) の examFeeBankInfo」の順で優先。
export const GET = withTenant(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const schoolKey = searchParams.get("schoolKey");

  let bankInfoText: string | null = null;
  let resolved = emptyConfig();
  try {
    const db = getTenantDb();
    const cohorts = await db.cohort.findMany({
      where: schoolKey
        ? { status: "受付中", OR: [{ schoolKey }, { schoolKey: null }] }
        : { status: "受付中" },
      select: { schoolKey: true, examFeeBankInfo: true },
    });
    const specific = cohorts.find((c) => c.schoolKey === schoolKey && c.examFeeBankInfo);
    const global = cohorts.find((c) => !c.schoolKey && c.examFeeBankInfo);
    bankInfoText = (specific?.examFeeBankInfo || global?.examFeeBankInfo) ?? null;

    const row = await db.systemSetting.findFirst({ where: { key: PAYMENT_CONFIG_KEY } });
    resolved = resolvePayment(parsePaymentMap(row?.value), schoolKey);
  } catch {
    /* DB未接続などのときは環境変数の既定値にフォールバック */
  }

  return NextResponse.json({
    bankName: process.env.PAYMENT_BANK_NAME || "三菱UFJ銀行 新宿支店",
    accountType: process.env.PAYMENT_ACCOUNT_TYPE || "普通",
    accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || "1234567",
    accountHolder: process.env.PAYMENT_ACCOUNT_HOLDER || "（ザ）ハバガクエン",
    deadline: process.env.PAYMENT_DEADLINE || "出願後7日以内",
    // 受験料の振込先テキスト：支払い設定 > 選考管理(#7) の順で優先
    bankInfoText: resolved.examFee.bankInfo || bankInfoText,
    examFeeQr: resolved.examFee.qr,        // 受験料のQR（data URI）
    tuitionBankInfo: resolved.tuition.bankInfo || null, // 学費の振込先テキスト
    tuitionQr: resolved.tuition.qr,        // 学費のQR（data URI）
  });
});
