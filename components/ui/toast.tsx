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

let nextId = 1;

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmReq, setConfirmReq] = useState<{
    opts: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const toast = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = nextId++;
    setToasts((cur) => [...cur, { id, kind, msg }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmReq({ opts, resolve });
      }),
    [],
  );

  const closeConfirm = useCallback(
    (ok: boolean) => {
      setConfirmReq((cur) => {
        if (cur) cur.resolve(ok);
        return null;
      });
    },
    [],
  );

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
        className="fixed top-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none"
        role="region"
        aria-label="通知"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-sm break-words ${KIND_STYLE[t.kind]}`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {confirmReq && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ui-confirm-title"
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeConfirm(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
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
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {confirmReq.opts.cancelLabel || "キャンセル"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => closeConfirm(true)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg text-white ${
                  confirmReq.opts.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
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
