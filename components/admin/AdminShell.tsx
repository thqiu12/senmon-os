"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * wsdb 風の管理画面シェル。
 * 左サイドバー固定（ダーク #0d1219, アクティブ青）、右にコンテンツ。
 */

type IconKey =
  | "home" | "clipboard" | "megaphone" | "edit" | "handshake"
  | "graduation" | "book" | "chart" | "wrench" | "users";

interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  external?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/admin/dashboard", label: "ダッシュボード", icon: "home" }],
  },
  {
    label: "入学管理",
    items: [
      { href: "/admin/cohorts",       label: "選考管理",     icon: "clipboard" },
      { href: "/admin/announcements", label: "お知らせ",     icon: "megaphone" },
      { href: "/admin/prospects",     label: "希望者リスト", icon: "edit" },
      { href: "/admin/agents",        label: "エージェント", icon: "handshake" },
    ],
  },
  {
    label: "在籍管理",
    items: [
      { href: "/admin/enrollment", label: "入学手続き", icon: "graduation" },
      {
        href: "https://tk2-402-42194.vs.sakura.ne.jp:8443/",
        label: "在籍管理 (wsdb)",
        icon: "book",
        external: true,
      },
    ],
  },
  {
    label: "報告・設定",
    items: [
      { href: "/admin/quota",       label: "定員管理",   icon: "chart" },
      { href: "/admin/form-config", label: "フォーム管理", icon: "wrench" },
      { href: "/admin/accounts",    label: "アカウント", icon: "users" },
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

  const firstChar = (me?.displayName || "管").charAt(0);

  return (
    <div className="wsdb-app">
      <aside className="wsdb-sidebar">
        <div className="wsdb-brand">
          <div className="wsdb-brand-mark">
            <BrandIcon />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-white text-[15px] leading-tight">専門学校</div>
            <div className="text-[11px] text-white/55 mt-0.5">入学・出願システム</div>
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
                    className={`wsdb-nav-item ${active ? "active" : ""}`}
                  >
                    <span className="wsdb-nav-icon"><NavIcon name={it.icon} /></span>
                    <span className="truncate flex-1">{it.label}</span>
                    {it.external && <span className="text-xs text-white/40">↗</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {me && (
          <div className="wsdb-nav-foot">
            <div className="wsdb-nav-foot-avatar">{firstChar}</div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-bold text-[13px] truncate">{me.displayName || "管理者"}</div>
              <div className="text-white/45 text-[11px]">{roleLabel(me.role)}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/45 hover:text-white text-base"
              title="ログアウト"
            >
              ⏻
            </button>
          </div>
        )}
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

function BrandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c3 1.5 9 1.5 12 0v-5" />
      <path d="M22 10v6" />
    </svg>
  );
}

function NavIcon({ name }: { name: IconKey }) {
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24"><path d="M3 12 12 4l9 8" /><path d="M5 10v10h14V10" /></svg>
      );
    case "clipboard":
      return (
        <svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M9 11h6M9 15h4" /></svg>
      );
    case "megaphone":
      return (
        <svg viewBox="0 0 24 24"><path d="M3 11v2c0 1 1 2 2 2h2l5 4V5L7 9H5c-1 0-2 1-2 2z" /><path d="M16 8a5 5 0 0 1 0 8" /></svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24"><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="m18 2 4 4-11 11H7v-4z" /></svg>
      );
    case "handshake":
      return (
        <svg viewBox="0 0 24 24"><path d="M11 17 8 14l3-3 3 3 6-6-3-3-6 6" /><path d="M2 14h6M16 7h6" /></svg>
      );
    case "graduation":
      return (
        <svg viewBox="0 0 24 24"><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 1.5 9 1.5 12 0v-5" /></svg>
      );
    case "book":
      return (
        <svg viewBox="0 0 24 24"><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z" /><path d="M4 17a3 3 0 0 1 3-3h12" /></svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 24 24"><path d="M3 21h18" /><rect x="5" y="11" width="3" height="8" /><rect x="11" y="7" width="3" height="12" /><rect x="17" y="13" width="3" height="6" /></svg>
      );
    case "wrench":
      return (
        <svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-7 7-1-1-7-7 1.7-1.3a4 4 0 0 0 5-5z" /></svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M15 15c4 0 6 2 6 5" /></svg>
      );
  }
}
