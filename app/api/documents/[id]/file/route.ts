import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getSession, isAdmin, verifyStudentOwnership } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { ENV } from "@/lib/env";
import { logError } from "@/lib/logger";

function uploadRoot(): string {
  return path.isAbsolute(ENV.UPLOAD_DIR) ? ENV.UPLOAD_DIR : path.join(process.cwd(), ENV.UPLOAD_DIR);
}

export const GET = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  try {
    const doc = await getTenantDb().document.findFirst({
      where: { id: params.id },
      select: {
        applicationId: true,
        fileName: true,
        originalName: true,
        mimeType: true,
      },
    });
    if (!doc) return NextResponse.json({ error: "書類が見つかりません" }, { status: 404 });

    // 認証: 管理者 OR 申請者本人
    const session = await getSession(request);
    if (!isAdmin(session)) {
      const url = new URL(request.url);
      const applicationNo = url.searchParams.get("applicationNo");
      const email = url.searchParams.get("email");
      if (!applicationNo || !email) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      }
      const own = await verifyStudentOwnership(applicationNo, email);
      if (!own.valid || own.applicationId !== doc.applicationId) {
        return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
      }
    }

    const fullPath = path.join(uploadRoot(), doc.applicationId, doc.fileName);
    let data: Buffer;
    try {
      await stat(fullPath);
      data = await readFile(fullPath);
    } catch {
      return NextResponse.json(
        { error: "ファイル本体が見つかりません（デモデータ等のため未配置の可能性があります）" },
        { status: 404 },
      );
    }

    const inline = new URL(request.url).searchParams.get("inline") === "1";
    const disposition = inline ? "inline" : "attachment";
    return new NextResponse(data as unknown as BodyInit, {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    logError("GET /api/documents/[id]/file", e);
    return NextResponse.json({ error: "ファイル取得に失敗しました" }, { status: 500 });
  }
});
