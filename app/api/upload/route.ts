import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { APPLY_RATE_LIMITS } from "@/lib/rateLimits";
import { ENV } from "@/lib/env";
import { DocTypeEnum } from "@/lib/schemas";
import { FILE_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";

const DEFAULT_FILE_LABELS = new Set(FILE_FIELD_DEFAULTS.map((f) => f.label));

const MAX_FILE_SIZE = ENV.MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function uploadRoot(): string {
  return path.isAbsolute(ENV.UPLOAD_DIR) ? ENV.UPLOAD_DIR : path.join(process.cwd(), ENV.UPLOAD_DIR);
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  // 共有IP(学校PCルーム)から多数が複数ファイルを一斉アップロードするため上限を大きく。
  // 1ファイルあたりのサイズは別途 MAX_FILE_SIZE_MB で制限済み。
  if (!checkRateLimit(`upload:${ip}`, APPLY_RATE_LIMITS.upload.max, APPLY_RATE_LIMITS.upload.windowMs)) {
    return NextResponse.json(
      { error: "アップロード制限を超えました。しばらく後に再試行してください" },
      { status: 429 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const applicationId = formData.get("applicationId") as string | null;
    const applicationNo = formData.get("applicationNo") as string | null;
    const email = formData.get("email") as string | null;
    const docTypeRaw = formData.get("docType") as string | null;

    if (!file) return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    if (!docTypeRaw) return NextResponse.json({ error: "書類種別が必要です" }, { status: 400 });

    // docType の許可判定:
    //  1) DocTypeEnum (定型)            … 出願標準書類
    //  2) "入学手続き_" 接頭辞 (動的)    … cohort 別チェックリスト
    //  3) FormFieldConfig.fieldType=file の label と一致 (動的)
    //     … admin が /admin/form-config で追加した任意の添付欄
    //
    // いずれにも該当しない場合は 400。
    // 文字数・パストラバーサル等の安全チェックは共通で施す。
    if (docTypeRaw.length === 0 || docTypeRaw.length > 100 || /[\/\\\x00-\x1F]/.test(docTypeRaw)) {
      return NextResponse.json({ error: "書類種別の名称が不正です" }, { status: 400 });
    }

    let docType: string;
    const docTypeParsed = DocTypeEnum.safeParse(docTypeRaw);
    if (docTypeParsed.success) {
      docType = docTypeParsed.data;
    } else if (docTypeRaw.startsWith("入学手続き_")) {
      const suffix = docTypeRaw.slice("入学手続き_".length);
      if (suffix.length === 0) {
        return NextResponse.json({ error: "書類種別の名称が不正です" }, { status: 400 });
      }
      docType = docTypeRaw;
    } else if (DEFAULT_FILE_LABELS.has(docTypeRaw)) {
      // 既定の添付欄（証明写真・出席証明書 等）
      docType = docTypeRaw;
    } else {
      // 動的フォーム設定の file 欄ラベルを許可するか判定
      // ※ DB に該当 label のファイル欄が無ければ拒否（オープン許可ではない）
      const configured = await prisma.formFieldConfig.findFirst({
        where: { fieldType: "file", label: docTypeRaw, isEnabled: true },
        select: { id: true },
      });
      if (!configured) {
        return NextResponse.json({ error: "書類種別が不正です" }, { status: 400 });
      }
      docType = docTypeRaw;
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `ファイルサイズは${ENV.MAX_FILE_SIZE_MB}MB以下にしてください` },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = await fileTypeFromBuffer(bytes);
    if (!sniffed || !ALLOWED_MIME.has(sniffed.mime)) {
      return NextResponse.json(
        { error: "JPEG、PNG、WebP、PDFファイルのみアップロードできます" },
        { status: 400 },
      );
    }

    const session = await getSession(request);
    let resolvedApplicationId: string | null = applicationId;

    if (isAdmin(session)) {
      if (!applicationId) {
        return NextResponse.json({ error: "applicationIdが必要です" }, { status: 400 });
      }
    } else {
      if (!applicationNo || !email) {
        return NextResponse.json({ error: "applicationNoとemailが必要です" }, { status: 400 });
      }
      const app = await prisma.application.findFirst({
        where: { applicationNo, email },
        select: { id: true },
      });
      if (!app) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
      resolvedApplicationId = app.id;
    }

    if (!resolvedApplicationId || !/^[a-zA-Z0-9_-]+$/.test(resolvedApplicationId)) {
      return NextResponse.json({ error: "applicationIdが不正です" }, { status: 400 });
    }

    const application = await prisma.application.findUnique({
      where: { id: resolvedApplicationId },
    });
    if (!application) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });

    const uploadDir = path.join(uploadRoot(), resolvedApplicationId);
    await mkdir(uploadDir, { recursive: true });

    const ext = "." + sniffed.ext;
    const fileName = `${Date.now()}_${crypto.randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, bytes);

    // 差し戻された同 docType の書類があれば、再アップロード = 置き換えとみなして削除。
    // （入学手続き_書類は別経路のため対象外）
    const supersededIds: string[] = [];
    if (!docType.startsWith("入学手続き_")) {
      const rejected = await prisma.document.findMany({
        where: {
          applicationId: resolvedApplicationId,
          docType,
          status: "差し戻し",
        },
        select: { id: true, fileName: true },
      });
      for (const r of rejected) {
        // 物理ファイル削除（失敗しても続行）
        try {
          await unlink(path.join(uploadDir, r.fileName));
        } catch {
          /* file might already be gone */
        }
        supersededIds.push(r.id);
      }
      if (supersededIds.length > 0) {
        await prisma.document.deleteMany({ where: { id: { in: supersededIds } } });
      }
    }

    // filePath は認証付きダウンロードルートを指す（UPLOAD_DIR が public/ 外でも到達可能）。
    // id を先に生成して 1 回の create で filePath を確定する
    // （旧実装は create→update の 2 段で、update 失敗時に空 filePath の行が残るリスクがあった）。
    const docId = crypto.randomUUID();
    const downloadUrl = `/api/documents/${docId}/file`;
    const document = await prisma.document.create({
      data: {
        id: docId,
        applicationId: resolvedApplicationId,
        docType,
        fileName,
        originalName: file.name.slice(0, 255),
        filePath: downloadUrl,
        fileSize: file.size,
        mimeType: sniffed.mime,
        status: "提出済", // 再アップロード時は提出済に戻す（差し戻し解除）
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
        status: document.status,
      },
      // 再アップロードで差し戻し書類を置き換えた場合は、その ID を返す
      // → クライアント側で documents 配列から該当エントリを削除できる
      supersededDocumentIds: supersededIds,
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

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) return NextResponse.json({ error: "ドキュメントが見つかりません" }, { status: 404 });

    const session = await getSession(request);
    if (!isAdmin(session)) {
      if (!applicationNo || !email) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      }
      const app = await prisma.application.findFirst({
        where: { applicationNo, email },
        select: { id: true },
      });
      if (!app || app.id !== document.applicationId) {
        return NextResponse.json(
          { error: "この書類を削除する権限がありません" },
          { status: 403 },
        );
      }
    }

    const fullPath = path.join(uploadRoot(), document.applicationId, document.fileName);
    try {
      await unlink(fullPath);
    } catch {
      /* file already missing, continue */
    }

    await prisma.document.delete({ where: { id: documentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/upload error:", error);
    return NextResponse.json({ error: "ファイルの削除に失敗しました" }, { status: 500 });
  }
}
