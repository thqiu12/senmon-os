import React from "react";

/**
 * 共有 SVG ラインアイコン（Lucide/Heroicons 互換のストローク 1.75）。
 * 絵文字をやめて全画面で一貫した見た目にするための最小セット。
 * 使い方: <Icon name="user" className="w-5 h-5 text-accent" />
 */

export type IconName =
  | "user" | "users" | "id" | "phone" | "home" | "globe" | "calendar"
  | "pencil" | "graduation" | "tag" | "handshake" | "star" | "ticket"
  | "clipboard" | "megaphone" | "book" | "chart" | "wrench" | "school"
  | "monitor" | "stethoscope" | "doc" | "mail" | "check" | "info"
  | "yen" | "send" | "signature" | "inbox" | "award";

const PATHS: Record<IconName, React.ReactNode> = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><circle cx="17" cy="9" r="2.6" /><path d="M15 15c4 0 6 2 6 5" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M13 10h5M13 14h5M5.5 15c.6-1.4 2-2 3-2s2.4.6 3 2" /></>,
  phone: <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  graduation: <><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 1.5 9 1.5 12 0v-5" /></>,
  tag: <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></>,
  handshake: <><path d="M11 17 8 14l3-3 3 3 6-6-3-3-6 6" /><path d="M2 14h6M16 7h6" /></>,
  star: <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21.9l1.1-6.5L2.6 9.8l6.5-.9z" />,
  ticket: <><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 1 0-4z" /><path d="M15 6v12" strokeDasharray="2 2" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><rect x="9" y="2.5" width="6" height="3.5" rx="1" /><path d="M9 11h6M9 15h4" /></>,
  megaphone: <><path d="M3 11v2c0 1 1 2 2 2h2l5 4V5L7 9H5c-1 0-2 1-2 2z" /><path d="M16 8a5 5 0 0 1 0 8" /></>,
  book: <><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" /><path d="M4 17a3 3 0 0 1 3-3h12" /></>,
  chart: <><path d="M3 21h18" /><rect x="5" y="11" width="3" height="8" /><rect x="11" y="7" width="3" height="12" /><rect x="17" y="13" width="3" height="6" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-7 7-1-1-7-7 1.7-1.3a4 4 0 0 0 5-5z" />,
  school: <><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M9 21v-5h6v5" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  stethoscope: <><path d="M6 3v5a4 4 0 0 0 8 0V3" /><path d="M10 16v1a4 4 0 0 0 8 0v-2" /><circle cx="18" cy="12" r="2" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  check: <path d="M5 12l4 4 10-10" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></>,
  yen: <><circle cx="12" cy="12" r="9" /><path d="M8 8l4 5 4-5M8 14h8M8 17h8M12 14v4" /></>,
  send: <><path d="M22 3 11 14" /><path d="M22 3 15 21l-4-7-7-4z" /></>,
  signature: <><path d="M3 19h18" /><path d="M5 16c2-6 4-9 6-9s1 6 3 6 2-3 4-3" /></>,
  inbox: <><path d="M3 12h5l2 3h4l2-3h5" /><path d="M5 6h14l2 6v6H3v-6z" /></>,
  award: <><circle cx="12" cy="9" r="5" /><path d="M9 13l-2 8 5-3 5 3-2-8" /></>,
};

export function Icon({
  name,
  className = "w-5 h-5",
  strokeWidth = 1.75,
  ...rest
}: { name: IconName; className?: string; strokeWidth?: number } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export default Icon;
