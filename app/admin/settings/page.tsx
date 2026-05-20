"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 旧 /admin/settings ページ。「フォーム管理」配下の「全体設定」タブに統合済み。
 * 既存ブックマークからのアクセスをリダイレクトする。
 */
export default function LegacySettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/form-config?tab=general");
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">フォーム管理ページに移動中…</p>
    </div>
  );
}
