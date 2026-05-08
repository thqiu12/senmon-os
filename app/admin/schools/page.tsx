"use client";

import { SchoolsManager } from "@/app/admin/components/SchoolsManager";

export default function SchoolsAdminPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-800 text-white shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-navy-800 font-bold text-sm">専</span>
            </div>
            <div className="hidden lg:block">
              <h1 className="font-bold text-sm leading-tight">志望校管理</h1>
              <p className="text-navy-400 text-xs">入学出願システム</p>
            </div>
          </div>
          <a href="/admin/dashboard" className="text-navy-300 hover:text-white text-xs transition-colors px-2 py-1.5 rounded hover:bg-navy-700">
            ← ダッシュボードへ
          </a>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <SchoolsManager />
      </main>
    </div>
  );
}
