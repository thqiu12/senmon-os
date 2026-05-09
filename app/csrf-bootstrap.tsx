"use client";

import { useEffect } from "react";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function CsrfBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window & { __csrfPatched?: boolean };
    if (w.__csrfPatched) return;
    w.__csrfPatched = true;

    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        return original(input, init);
      }
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith("/api/")) return original(input, init);

      const token = readCookie("csrf_token");
      if (!token) return original(input, init);

      const headers = new Headers(init?.headers || (typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined));
      if (!headers.has("x-csrf-token")) headers.set("x-csrf-token", token);
      return original(input, { ...init, headers });
    };
  }, []);
  return null;
}
