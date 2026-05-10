"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

export type ToastKind = "info" | "success" | "warn" | "error";
type Toast = { id: number; kind: ToastKind; msg: string };
type ConfirmOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

interface UICtx {
  toast: (msg: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<UICtx | null>(null);

export function useUI(): UICtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUI must be used within <UIProvider>");
  return c;
}

const KIND_STYLE: Record<ToastKind, string> = {
  info: "bg-blue-600 text-white",
  success: "bg-green-600 text-white",
  warn: "bg-amber-500 text-white",
  error: "bg-red-600 text-white",
};

const KIND_ICON: Record<ToastKind, string> = {
  info: "ℹ",
  success: "✓",
  warn: "⚠",
  error: "✕",
};

let nextId = 1;
const TOAST_TTL_MS = 4500;

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmReq, setConfirmReq] = useState<{
    opts: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (msg: string, kind: ToastKind = "info") => {
      const id = nextId++;
      setToasts((cur) => [...cur, { id, kind, msg }]);
      setTimeout(() => dismissToast(id), TOAST_TTL_MS);
    },
    [dismissToast],
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmReq({ opts, resolve });
      }),
    [],
  );

  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmReq((cur) => {
      if (cur) cur.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!confirmReq) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConfirm(false);
      if (e.key === "Enter") closeConfirm(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmReq, closeConfirm]);

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      <div
        className="fixed top-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)]"
        role="region"
        aria-label="通知"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-sm break-words animate-toast-in ${KIND_STYLE[t.kind]}`}
          >
            <span aria-hidden="true" className="shrink-0 leading-5">
              {KIND_ICON[t.kind]}
            </span>
            <span className="flex-1 leading-5">{t.msg}</span>
            <button
              type="button"
              aria-label="閉じる"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 -mr-1 -mt-0.5 px-1 py-0.5 text-base leading-5 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/40 rounded"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {confirmReq && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ui-confirm-title"
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/40 p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeConfirm(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-pop-in">
            {confirmReq.opts.title && (
              <h3 id="ui-confirm-title" className="text-lg font-bold text-gray-800 mb-2">
                {confirmReq.opts.title}
              </h3>
            )}
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mb-6">
              {confirmReq.opts.message}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
              >
                {confirmReq.opts.cancelLabel || "キャンセル"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => closeConfirm(true)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  confirmReq.opts.danger
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                    : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                }`}
              >
                {confirmReq.opts.okLabel || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
