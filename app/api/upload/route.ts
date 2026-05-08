import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, checkRateLimit } from "@/lib/auth";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function POST(request: NextRequest) {
  // レートリミット（IP単位: 1分20ファイルまで）
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(`upload:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "アップロード制限を超えました。しばらく後に再試行してください" }, { status: 429 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const applicationId = formData.get("applicationId") as string;
    const applicationNo = formData.get("applicationNo") as string;
    const email = formData.get("email") as string;
    const docType = formData.get("docType") as string;

    if (!file) return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    if (!docType) return NextResponse.json({ error: "書類種別が必要です" }, { status: 400 });

    // ファイルサイズ・タイプチェック
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `ファイルサイズは${process.env.MAX_FILE_SIZE_MB || 10}MB以下にしてください` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "JPEG、PNG、WebP、PDFファイルのみアップロードできます" }, { status: 400 });
    }

    // 認証チェック：管理者 or 学生本人
    const session = await getSession(request);
    let resolvedApplicationId = applicationId;

    if (isAdmin(session)) {
      // 管理者：applicationId 直接指定
      if (!applicationId) return NextResponse.json({ error: "applicationIdが必要です" }, { status: 400 });
    } else {
      // 学生：applicationNo + email で本人確認
      if (!applicationNo || !email) {
        return NextResponse.json({ error: "applicationNoとemailが必要です" }, { status: 400 });
      }
      const app = await prisma.application.findFirst({
        where: { applicationNo, email: email },
        select: { id: true },
      });
      if (!app) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
      resolvedApplicationId = app.id;
    }

    const application = await prisma.application.findUnique({ where: { id: resolvedApplicationId } });
    if (!application) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });

    // ファイル保存
    const uploadDir = path.join(process.cwd(), "public", "uploads", resolvedApplicationId);
    await mkdir(uploadDir, { recursive: true });

    const ext = path.extname(file.name);
    const safeName = file.name
      .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF._-]/g, "_")
      .substring(0, 100);
    const timestamp = Date.now();
    const fileName = `${timestamp}_${safeName}`;
    const filePath = path.join(uploadDir, fileName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    const document = await prisma.document.create({
      data: {
        applicationId: resolvedApplicationId,
        docType,
        fileName,
        originalName: file.name,
        filePath: `/uploads/${resolvedApplicationId}/${fileName}`,
        fileSize: file.size,
        mimeType: file.type,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        docType: document.docType,
        fileName: document.fileName,
        originalName: document.originalName,
        filePath: document.filePath,
        fileSize: document.fileSize,
      },
    });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json({ error: "ファイルのアップロードに失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("id");
    const applicationNo = searchParams.get("applicationNo");
    const email = searchParams.get("email");

    if (!documentId) return NextResponse.json({ error: "ドキュメントIDが必要です" }, { status: 400 });

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) return NextResponse.json({ error: "ドキュメントが見つかりません" }, { status: 404 });

    // 認証：管理者 or 学生本人
    const session = await getSession(request);
    if (!isAdmin(session)) {
      if (!applicationNo || !email) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      }
      const app = await prisma.application.findFirst({
        where: { applicationNo, email: email },
        select: { id: true },
      });
      if (!app || app.id !== document.applicationId) {
        return NextResponse.json({ error: "この書類を削除する権限がありません" }, { status: 403 });
      }
    }

    const { unlink } = await import("fs/promises");
    const fullPath = path.join(process.cwd(), "public", document.filePath);
    try { await unlink(fullPath); } catch { /* ファイルが存在しない場合は無視 */ }

    await prisma.document.delete({ where: { id: documentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/upload error:", error);
    return NextResponse.json({ error: "ファイルの削除に失敗しました" }, { status: 500 });
  }
}
