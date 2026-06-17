import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { aiEnabled, generateText, parseJsonLoose, SONNET } from "@/lib/anthropic";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

type DraftType = "interview" | "result" | "enrollment";
const TYPE_PURPOSE: Record<DraftType, string> = {
  interview: "面接（選考）のご案内。日時・場所・持ち物の確認を丁寧に伝える。",
  result: "選考結果のお知らせ。結果に応じた適切なトーンで、次のステップを案内する。",
  enrollment: "入学手続きのご案内。手続きの流れ・期限・必要書類を分かりやすく伝える。",
};

interface DraftLang { subject: string; body: string; }
export interface EmailDrafts { ja: DraftLang; zh: DraftLang; en: DraftLang; }

const SYSTEM = [
  "あなたは日本の専門学校の入試事務担当として、出願者へ送るメール文面を作成します。",
  "・日本語は学校から受験者・保護者へ送る、丁寧で自然な敬語（です・ます調、過度にへりくだらない）。",
  "・中文（簡体字）と English は、日本語と同じ内容を、それぞれの言語として自然な丁寧表現に翻訳する（直訳調にしない）。",
  "・与えられた事実だけを使う。日時・金額・期限などを勝手に創作・補完しない。情報が無い箇所は『追ってご連絡します』等にとどめる。",
  "・署名やフッターは入れない（システム側で付与）。",
  "・出力は JSON オブジェクトのみ。前後の説明文・コードフェンスは出力しない。",
].join("\n");

// GET: AI が有効か（UIのボタン出し分け用）
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!(await hasCapability(session, "notification.send"))) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  return NextResponse.json({ aiEnabled: aiEnabled() });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(request);
  if (!(await hasCapability(session, "notification.send"))) {
    return NextResponse.json({ error: "メールを送信する権限がありません" }, { status: 403 });
  }
  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI機能が未設定です（ANTHROPIC_API_KEY）" }, { status: 400 });
  }

  let type: DraftType = "interview";
  try {
    const b = await request.json();
    if (b?.type === "interview" || b?.type === "result" || b?.type === "enrollment") type = b.type;
  } catch {
    /* default */
  }

  try {
    const app = await prisma.application.findUnique({
      where: { id: params.id },
      select: {
        applicationNo: true,
        lastName: true, firstName: true,
        schoolName: true, department: true, status: true,
        interviewDate: true, interviewTime: true, interviewPlace: true,
        enrollmentProcedure: { select: { instructions: true, deadline: true } },
      },
    });
    if (!app) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });

    // 事実コンテキスト（AIが創作しないよう、判明している情報だけを渡す）
    const facts: string[] = [];
    facts.push(`受付番号: ${app.applicationNo}`);
    facts.push(`氏名: ${app.lastName} ${app.firstName} 様`);
    facts.push(`志望校: ${app.schoolName}${app.department ? "（" + app.department + "）" : ""}`);
    facts.push(`現在の状態: ${app.status}`);
    if (type === "interview") {
      if (app.interviewDate) facts.push(`面接日: ${app.interviewDate}`);
      if (app.interviewTime) facts.push(`面接時間: ${app.interviewTime}`);
      if (app.interviewPlace) facts.push(`面接場所: ${app.interviewPlace}`);
    }
    if (type === "result") {
      facts.push(`選考結果: ${app.status}`);
    }
    if (type === "enrollment") {
      if (app.enrollmentProcedure?.instructions) facts.push(`手続き案内: ${app.enrollmentProcedure.instructions}`);
      if (app.enrollmentProcedure?.deadline) facts.push(`手続き期限: ${app.enrollmentProcedure.deadline}`);
    }

    const user = [
      `目的: ${TYPE_PURPOSE[type]}`,
      "",
      "判明している事実（これ以外は創作しない）:",
      ...facts.map((f) => "・" + f),
      "",
      "次の JSON を返してください（subject は件名、body は本文プレーンテキスト）:",
      '{ "ja": {"subject":"","body":""}, "zh": {"subject":"","body":""}, "en": {"subject":"","body":""} }',
    ].join("\n");

    const { text, usage } = await generateText({ system: SYSTEM, user, model: SONNET, maxTokens: 1500 });
    const drafts = parseJsonLoose<EmailDrafts>(text);
    if (!drafts || !drafts.ja?.body) {
      return NextResponse.json({ error: "下書きの生成結果を解析できませんでした" }, { status: 502 });
    }

    return NextResponse.json({ type, drafts, usage });
  } catch (e) {
    logError("POST /api/applications/[id]/draft-email", e);
    const m = e instanceof Error ? e.message : "生成に失敗しました";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
