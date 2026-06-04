"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * wsdb 風の管理画面シェル。
 * 左サイドバー固定、右にコンテンツ。
 * セクションごとにナビをグループ化。
 */

interface NavItem {
  href: string;
  label: string;
  icon?: string; // 絵文字 or 短いアイコン
  external?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/admin/dashboard", label: "ダッシュボード", icon: "🏠" }],
  },
  {
    label: "入学管理",
    items: [
      { href: "/admin/cohorts",       label: "選考管理",     icon: "📋" },
      { href: "/admin/announcements", label: "お知らせ",     icon: "📢" },
      { href: "/admin/prospects",     label: "希望者リスト", icon: "📝" },
      { href: "/admin/agents",        label: "エージェント", icon: "🤝" },
    ],
  },
  {
    label: "在籍管理",
    items: [
      { href: "/admin/enrollment", label: "入学手続き", icon: "🎓" },
      {
        href: "https://tk2-402-42194.vs.sakura.ne.jp:8443/",
        label: "在籍管理 (wsdb)",
        icon: "📚",
        external: true,
      },
    ],
  },
  {
    label: "報告・設定",
    items: [
      { href: "/admin/quota",       label: "定員管理",   icon: "📊" },
      { href: "/admin/form-config", label: "フォーム管理", icon: "🛠" },
      { href: "/admin/accounts",    label: "アカウント", icon: "👥" },
    ],
  },
];

interface AdminRole {
  role: string;
  displayName?: string;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<AdminRole | null>(null);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setMe({ role: d.user.role, displayName: d.user.displayName });
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin");
  };

  // accounts はスーパー管理者のみ
  const filteredNav = NAV.map((sec) => ({
    ...sec,
    items: sec.items.filter((it) => {
      if (it.href === "/admin/accounts" && me?.role !== "super_admin") return false;
      return true;
    }),
  })).filter((sec) => sec.items.length > 0);

  return (
    <div className="wsdb-app">
      <aside className="wsdb-sidebar">
        <div className="wsdb-brand">
          <div className="wsdb-brand-mark">専</div>
          <div className="min-w-0">
            <div className="font-extrabold text-white text-base leading-tight">専門学校</div>
            <div className="text-[11px] text-white/60">入学・出願システム</div>
          </div>
        </div>

        <nav className="wsdb-nav">
          {filteredNav.map((sec) => (
            <div key={sec.label}>
              <div className="wsdb-nav-section">{sec.label}</div>
              {sec.items.map((it) => {
                const active = !it.external && pathname.startsWith(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    target={it.external ? "_blank" : undefined}
                    rel={it.external ? "noopener noreferrer" : undefined}
                    className={`wsdb-nav-item flex items-center gap-2.5 ${active ? "active" : ""}`}
                  >
                    {it.icon && <span className="text-base shrink-0">{it.icon}</span>}
                    <span className="truncate">{it.label}</span>
                    {it.external && <span className="ml-auto text-xs text-white/40">↗</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-3 border-t border-white/10">
          {me && (
            <div className="flex items-center justify-between gap-2 px-1.5 py-2 text-xs">
              <div className="min-w-0">
                <div className="text-white/90 font-bold truncate">{me.displayName || "管理者"}</div>
                <div className="text-white/50">{roleLabel(me.role)}</div>
              </div>
              <button
                onClick={handleLogout}
                className="text-white/60 hover:text-white text-[11px] font-semibold"
                title="ログアウト"
              >
                ⏻
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="wsdb-main">{children}</main>
    </div>
  );
}

function roleLabel(role: string): string {
  switch (role) {
    case "super_admin": return "スーパー管理者";
    case "admin":       return "管理者";
    case "interviewer": return "面接官";
    default:            return role;
  }
}
