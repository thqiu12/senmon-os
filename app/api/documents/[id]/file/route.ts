import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { docPhysicalPath } from "@/lib/storage";

// インラインで描画させず、必ずダウンロード扱いにする（HTML/SVG等によるXSSを防ぐ）
const SAFE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

// GET /api/documents/:id/file?applicationNo=...&email=...
// 管理者、または「出願番号 + メール」で本人確認できた申請者のみ取得可能。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const document = await prisma.document.findUnique({
      where: { id },
      include: { application: { select: { applicationNo: true, email: true } } },
    });
    if (!document) {
      return NextResponse.json({ error: "書類が見つかりません" }, { status: 404 });
    }

    // 認証：管理者 or 学生本人
    const session = await getSession(request);
    if (!isAdmin(session)) {
      const { searchParams } = new URL(request.url);
      const applicationNo = searchParams.get("applicationNo");
      const email = searchParams.get("email");
      if (
        !applicationNo ||
        !email ||
        document.application.applicationNo !== applicationNo ||
        document.application.email !== email
      ) {
        return NextResponse.json({ error: "アクセスが拒否されました" }, { status: 403 });
      }
    }

    // 物理ファイルを読み込み（旧 public/uploads 配置にもフォールバック）
    let data: Buffer;
    try {
      data = await readFile(docPhysicalPath(document.applicationId, document.fileName));
    } catch {
      try {
        data = await readFile(
          path.join(process.cwd(), "public", "uploads", document.applicationId, document.fileName)
        );
      } catch {
        return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
      }
    }

    const mime = SAFE_MIME.has(document.mimeType) ? document.mimeType : "application/octet-stream";
    const asciiName = document.originalName.replace(/[^\x20-\x7E]/g, "_");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        // 常に attachment（inline 描画を禁止）
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
          document.originalName
        )}`,
        "Content-Length": String(data.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/documents/[id]/file error:", error);
    return NextResponse.json({ error: "ファイルの取得に失敗しました" }, { status: 500 });
  }
}
