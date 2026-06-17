import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { aiEnabled, generateText, parseJsonLoose, HAIKU } from "@/lib/anthropic";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

export interface InterviewSummary {
  summary: string;
  recommendation: string; // 合格 / 補欠合格 / 不合格 / 保留
  reasons: string[];
  divergence: string | null; // 面接官間で評価が割れている場合の説明
  confidence: "high" | "medium" | "low";
}

const SYSTEM = [
  "あなたは日本の専門学校の入試担当の補佐役です。複数の面接官による面接フィードバック（点数と所見）を読み、",
  "教務担当が合否を判断するための『講評』と『推奨合否』をまとめます。",
  "重要な原則：",
  "・与えられたフィードバックの内容だけに基づくこと。事実を捏造しない。",
  "・最終決定はしない。あくまで判断材料（推奨）として提示する。",
  "・面接官の間で評価や推薦が割れている場合は divergence に必ず明記する。",
  "・出力は JSON オブジェクトのみ。前後の説明文・コードフェンスは出力しない。",
].join("\n");

function buildUser(app: {
  lastName: string; firstName: string; schoolName: string; department: string;
  interviewFeedbacks: Array<{
    interviewerName: string;
    scoreJapanese: number | null; scoreMotivation: number | null; scorePersonality: number | null;
    scoreAcademic: number | null; scoreOverall: number | null;
    strengths: string | null; concerns: string | null; notes: string | null; recommendation: string;
  }>;
}): string {
  const lines: string[] = [];
  lines.push(`受験者: ${app.lastName} ${app.firstName} / 志望: ${app.schoolName}${app.department ? "（" + app.department + "）" : ""}`);
  lines.push(`面接フィードバック ${app.interviewFeedbacks.length} 件:`);
  app.interviewFeedbacks.forEach((f, i) => {
    const s = [
      f.scoreJapanese != null ? `日本語${f.scoreJapanese}` : null,
      f.scoreMotivation != null ? `志望動機${f.scoreMotivation}` : null,
      f.scorePersonality != null ? `人柄${f.scorePersonality}` : null,
      f.scoreAcademic != null ? `学力${f.scoreAcademic}` : null,
      f.scoreOverall != null ? `総合${f.scoreOverall}` : null,
    ].filter(Boolean).join(" / ");
    lines.push(`【${i + 1}】面接官: ${f.interviewerName} ｜ 推薦: ${f.recommendation}`);
    if (s) lines.push(`  評価(5点満点): ${s}`);
    if (f.strengths) lines.push(`  良い点: ${f.strengths}`);
    if (f.concerns) lines.push(`  懸念点: ${f.concerns}`);
    if (f.notes) lines.push(`  備考: ${f.notes}`);
  });
  lines.push("");
  lines.push("次の JSON を返してください:");
  lines.push("{");
  lines.push('  "summary": "全体講評（3〜5文）",');
  lines.push('  "recommendation": "合格 / 補欠合格 / 不合格 / 保留 のいずれか",');
  lines.push('  "reasons": ["推奨理由を箇条書きで2〜4点"],');
  lines.push('  "divergence": "面接官間で評価が割れている点（無ければ null）",');
  lines.push('  "confidence": "high / medium / low（フィードバックの一致度・情報量に基づく）"');
  lines.push("}");
  return lines.join("\n");
}

async function loadApp(id: string) {
  return prisma.application.findUnique({
    where: { id },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      schoolName: true,
      department: true,
      interviewSummary: true,
      interviewSummaryAt: true,
      interviewSummaryModel: true,
      interviewFeedbacks: {
        select: {
          interviewerName: true,
          scoreJapanese: true, scoreMotivation: true, scorePersonality: true,
          scoreAcademic: true, scoreOverall: true,
          strengths: true, concerns: true, notes: true, recommendation: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

// GET: 保存済みの面接講評（あれば）+ 状態
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(request);
  if (!(await hasCapability(session, "result.decide"))) {
    return NextResponse.json({ error: "合否を判断する権限がありません" }, { status: 403 });
  }
  try {
    const app = await loadApp(params.id);
    if (!app) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    let summary: InterviewSummary | null = null;
    if (app.interviewSummary) summary = parseJsonLoose<InterviewSummary>(app.interviewSummary);
    return NextResponse.json({
      aiEnabled: aiEnabled(),
      hasFeedback: app.interviewFeedbacks.length > 0,
      feedbackCount: app.interviewFeedbacks.length,
      summary,
      generatedAt: app.interviewSummaryAt,
      model: app.interviewSummaryModel,
    });
  } catch (e) {
    logError("GET /api/applications/[id]/interview-summary", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: 面接講評+合否提案を生成・保存（決定はしない）
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(request);
  if (!(await hasCapability(session, "result.decide"))) {
    return NextResponse.json({ error: "合否を判断する権限がありません" }, { status: 403 });
  }
  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI機能が未設定です（ANTHROPIC_API_KEY）" }, { status: 400 });
  }
  try {
    const app = await loadApp(params.id);
    if (!app) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    if (app.interviewFeedbacks.length === 0) {
      return NextResponse.json({ error: "面接フィードバックがまだありません" }, { status: 400 });
    }

    const { text, usage } = await generateText({
      system: SYSTEM,
      user: buildUser(app),
      model: HAIKU,
      maxTokens: 1024,
    });
    const summary = parseJsonLoose<InterviewSummary>(text);
    if (!summary || !summary.summary) {
      return NextResponse.json({ error: "講評の生成結果を解析できませんでした" }, { status: 502 });
    }

    await prisma.application.update({
      where: { id: app.id },
      data: {
        interviewSummary: JSON.stringify(summary),
        interviewSummaryAt: new Date(),
        interviewSummaryModel: HAIKU,
      },
    });

    return NextResponse.json({ summary, generatedAt: new Date(), model: HAIKU, usage });
  } catch (e) {
    logError("POST /api/applications/[id]/interview-summary", e);
    const m = e instanceof Error ? e.message : "生成に失敗しました";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
