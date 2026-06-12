import React from "react";

/**
 * Compass ブランドのロゴマーク（方位磁針）。
 * currentColor を継承するので、青角丸や白角丸など各コンテナの中に置いて使う。
 * 例: <div className="...bg-blue-600 text-white"><CompassMark className="w-5 h-5" /></div>
 */
export function CompassMark({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 16l2-6 6-2-2 6z" />
    </svg>
  );
}
