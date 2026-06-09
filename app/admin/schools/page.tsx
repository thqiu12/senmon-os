"use client";

import { SchoolsManager } from "@/app/admin/components/SchoolsManager";

export default function SchoolsAdminPage() {
  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title">志望校管理</h1>
          <p className="wsdb-topbar-meta">出願先校・学科・募集枠の管理</p>
        </div>
      </div>
      <SchoolsManager />
    </>
  );
}
