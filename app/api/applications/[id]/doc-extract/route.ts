import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { ENV } from "@/lib/env";
import { logError } from "@/lib/logger";
import { compareExtraction, type DocExtraction } from "@/lib/docCheck";

export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-4-5";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function uploadRoot(): string {
  return path.isAbsolute(ENV.UPLOAD_DIR) ? ENV.UPLOAD_DIR : path.join(process.cwd(), ENV.UPLOAD_DIR);
}

const SYSTEM = [
  "あなたは日本の専門学校の出願書類を読み取る担当者です。",
  "渡された画像/PDF（在留カード・パスポート・卒業/成績証明書・各種証明書など）から、指定のフィールドを抽出してください。",
  "出力は JSON オブジェクトのみ。前後の説明文・コードフェンス・余計なテキストは一切出力しないこと。",
  "判読できない/記載が無い項目は null。日付はすべて YYYY-MM-DD 形式に正規化。画像が不鮮明で読めない場合は readable を false にし、notes に理由を書く。",
].join("\n");

const INSTRUCTION = [
  "次のフィールドを持つ JSON を返してください（不明は null）:",
  "{",
  '  "documentType": 書類の種類（在留カード/パスポート/卒業証明書/成績証明書 等）,',
  '  "fullNameRoman": ローマ字氏名,',
  '  "fullNameKanji": 漢字氏名,',
  '  "birthDate": 生年月日 YYYY-MM-DD,',
  '  "nationality": 国籍・地域,',
  '  "residenceStatus": 在留資格（在留カードの場合）,',
  '  "residenceExpiry": 在留期限 YYYY-MM-DD（在留カードの場合）,',
  '  "documentExpiry": 書類自体の有効期限 YYYY-MM-DD（パスポート/カード）,',
  '  "schoolName": 学校名（卒業/成績証明書の場合）,',
  '  "graduationDate": 卒業年月日 YYYY-MM-DD（卒業証明書の場合）,',
  '  "readable": 読み取れたか true/false,',
  '  "notes": 補足（任意）',
  "}",
].join("\n");

function parseJsonLoose(text: string): DocExtraction | null {
  const tryParse = (s: string): DocExtraction | null => {
    try {
      return JSON.parse(s) as DocExtraction;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return direct;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return tryParse(text.slice(first, last + 1));
  return null;
}

// POST: 指定書類を Haiku 4.5 vision で抽出 → 保存 → フォーム値と照合
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(request);
  if (!(await hasCapability(session, "document.review"))) {
    return NextResponse.json({ error: "書類を審査する権限がありません" }, { status: 403 });
  }
  if (!ENV.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI機能が未設定です（ANTHROPIC_API_KEY）" }, { status: 400 });
  }

  let documentId: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.documentId === "string") documentId = body.documentId;
  } catch {
    /* no body */
  }
  if (!documentId) return NextResponse.json({ error: "documentId は必須です" }, { status: 400 });

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        applicationId: true,
        docType: true,
        fileName: true,
        mimeType: true,
        application: {
          select: { birthDate: true, residenceExpiry: true, residenceStatus: true },
        },
      },
    });
    if (!doc || doc.applicationId !== params.id) {
      return NextResponse.json({ error: "書類が見つかりません" }, { status: 404 });
    }

    const isImage = IMAGE_TYPES.has(doc.mimeType);
    const isPdf = doc.mimeType === "application/pdf";
    if (!isImage && !isPdf) {
      return NextResponse.json(
        { error: `この形式はAI抽出に未対応です（${doc.mimeType}）。JPEG/PNG/WebP/GIF/PDF のみ対応。` },
        { status: 400 },
      );
    }

    const fullPath = path.join(uploadRoot(), doc.applicationId, doc.fileName);
    try {
      await stat(fullPath);
    } catch {
      return NextResponse.json({ error: "ファイル本体が見つかりません" }, { status: 404 });
    }
    const data = (await readFile(fullPath)).toString("base64");

    const docBlock: Anthropic.ContentBlockParam = isImage
      ? {
          type: "image",
          source: { type: "base64", media_type: doc.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data },
        }
      : {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        };

    const client = new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [docBlock, { type: "text", text: `書類種別の目安: ${doc.docType}\n\n${INSTRUCTION}` }],
        },
      ],
    });

    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const extraction = parseJsonLoose(text);
    if (!extraction) {
      return NextResponse.json({ error: "抽出結果を解析できませんでした", raw: text.slice(0, 500) }, { status: 502 });
    }

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        aiExtraction: JSON.stringify(extraction),
        aiExtractedAt: new Date(),
        aiModel: MODEL,
      },
    });

    const comparison = compareExtraction(extraction, doc.application);

    return NextResponse.json({
      extraction,
      comparison,
      usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens },
    });
  } catch (e) {
    logError("POST /api/applications/[id]/doc-extract", e);
    const m = e instanceof Error ? e.message : "抽出に失敗しました";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
