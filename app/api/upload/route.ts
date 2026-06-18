import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, checkRateLimit, getClientIp } from "@/lib/auth";
import { docPhysicalPath, docDownloadUrl, STORAGE_ROOT } from "@/lib/storage";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// マジックバイト（先頭シグネチャ）で実体を検証する。
// Content-Type はクライアントが詐称できるため、これだけに依存しない。
function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export async function POST(request: NextRequest) {
  // レートリミット（IP単位: 1分20ファイルまで）
  const ip = getClientIp(request);
  if (!checkRateLimit(`upload:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "アップロード制限を超えました。しばらく後に再試行してください" }, { status: 429 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const applicationId = formData.get("applicationId") as string;
    const applicationNo = formData.get("applicationNo") as string;
    const studentNo = formData.get("studentNo") as string;
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
    } else if (studentNo) {
      // 在籍学生：studentNo + email で本人確認し、紐づく出願に保存
      if (!email) return NextResponse.json({ error: "emailが必要です" }, { status: 400 });
      const student = await prisma.student.findFirst({
        where: { studentNo, email },
        select: { applicationId: true },
      });
      if (!student?.applicationId) {
        return NextResponse.json({ error: "在籍情報が見つかりません" }, { status: 404 });
      }
      resolvedApplicationId = student.applicationId;
    } else if (applicationNo && email) {
      // 出願者：applicationNo + email で本人確認（再開フロー）
      const app = await prisma.application.findFirst({
        where: { applicationNo, email: email },
        select: { id: true },
      });
      if (!app) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
      resolvedApplicationId = app.id;
    } else {
      return NextResponse.json({ error: "認証情報が必要です" }, { status: 400 });
    }

    const application = await prisma.application.findUnique({ where: { id: resolvedApplicationId } });
    if (!application) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });

    // ファイル保存（public/ の外。配信は /api/documents/[id]/file 経由でのみ）
    const uploadDir = path.join(STORAGE_ROOT, resolvedApplicationId);
    await mkdir(uploadDir, { recursive: true });

    const safeName = file.name
      .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF._-]/g, "_")
      .substring(0, 100);
    const timestamp = Date.now();
    const fileName = `${timestamp}_${safeName}`;
    const physicalPath = docPhysicalPath(resolvedApplicationId, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());

    // マジックバイト検証：宣言された Content-Type と実体が一致しない場合は拒否
    const sniffed = sniffMime(buffer);
    if (!sniffed || sniffed !== file.type) {
      return NextResponse.json(
        { error: "ファイルの内容が不正です（JPEG/PNG/WebP/PDFのみ）" },
        { status: 400 }
      );
    }

    await writeFile(physicalPath, buffer);

    // filePath には公開静的パスではなく、認証付きダウンロードURLを保存する
    const docId = crypto.randomUUID();
    const document = await prisma.document.create({
      data: {
        id: docId,
        applicationId: resolvedApplicationId,
        docType,
        fileName,
        originalName: file.name,
        filePath: docDownloadUrl(docId),
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
    const applicationId = searchParams.get("applicationId");

    if (!documentId) return NextResponse.json({ error: "ドキュメントIDが必要です" }, { status: 400 });

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) return NextResponse.json({ error: "ドキュメントが見つかりません" }, { status: 404 });

    // 認証：管理者 or 本人（applicationNo+email）
    const session = await getSession(request);
    if (!isAdmin(session)) {
      let ownerId: string | null = null;
      if (applicationNo && email) {
        const app = await prisma.application.findFirst({
          where: { applicationNo, email: email },
          select: { id: true },
        });
        ownerId = app?.id ?? null;
      }
      if (!ownerId || ownerId !== document.applicationId) {
        return NextResponse.json({ error: "この書類を削除する権限がありません" }, { status: 403 });
      }
    }

    const { unlink } = await import("fs/promises");
    const fullPath = docPhysicalPath(document.applicationId, document.fileName);
    try { await unlink(fullPath); } catch { /* ファイルが存在しない場合は無視 */ }

    await prisma.document.delete({ where: { id: documentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/upload error:", error);
    return NextResponse.json({ error: "ファイルの削除に失敗しました" }, { status: 500 });
  }
}
