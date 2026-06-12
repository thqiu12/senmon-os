"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { SCHOOLS } from "@/lib/formFieldDefaults";
import { useUI } from "@/components/ui/toast";

interface PayMethod { bankInfo: string; qr: string | null }
interface PaymentConfig { examFee: PayMethod; tuition: PayMethod }
type PaymentMap = Record<string, PaymentConfig>;

const GLOBAL_KEY = "__global__";
const MAX_QR_BYTES = 500 * 1024; // 約500KB

const SCHOOL_TABS: { key: string; name: string; global?: boolean }[] = [
  { key: GLOBAL_KEY, name: "全校共通", global: true },
  ...SCHOOLS.map((s) => ({ key: s.id, name: s.name })),
];

function emptyConfig(): PaymentConfig {
  return { examFee: { bankInfo: "", qr: null }, tuition: { bankInfo: "", qr: null } };
}

export function PaymentSettingsPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { toast, confirm } = useUI();
  const [map, setMap] = useState<PaymentMap>({});
  const [activeKey, setActiveKey] = useState<string>(GLOBAL_KEY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/payment-config");
      if (res.status === 401 || res.status === 403) { onUnauthorized(); return; }
      if (res.ok) setMap(await res.json());
      setLoading(false);
    })();
  }, [onUnauthorized]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const current = map[activeKey] ?? emptyConfig();
  const isGlobal = activeKey === GLOBAL_KEY;

  const update = useCallback((kind: "examFee" | "tuition", patch: Partial<PayMethod>) => {
    setMap((m) => {
      const cur = m[activeKey] ?? emptyConfig();
      return { ...m, [activeKey]: { ...cur, [kind]: { ...cur[kind], ...patch } } };
    });
    setDirty(true);
  }, [activeKey]);

  const save = async () => {
    setSaving(true);
    try {
      // 空のエントリ（全項目空欄）はマップから落として保存（不要なゴミを残さない）
      const cleaned: PaymentMap = {};
      for (const [k, v] of Object.entries(map)) {
        const hasAny = v.examFee.bankInfo || v.examFee.qr || v.tuition.bankInfo || v.tuition.qr;
        if (hasAny) cleaned[k] = v;
      }
      const res = await fetch("/api/admin/payment-config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleaned),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "保存に失敗しました");
      setMap(await res.json());
      toast("支払い設定を保存しました", "success");
      setDirty(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetSchool = async () => {
    const ok = await confirm({
      title: "全校共通に戻す",
      message: `「${SCHOOL_TABS.find((t) => t.key === activeKey)?.name}」の個別設定を削除して全校共通の設定を使うようにしますか？`,
      danger: true,
      okLabel: "リセット",
    });
    if (!ok) return;
    setMap((m) => { const n = { ...m }; delete n[activeKey]; return n; });
    setDirty(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">支払い設定</h2>
          <p className="text-sm text-gray-500 mt-0.5">受験料・学費の振込先とQRコードを学校別に設定（学生に表示）</p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-5 py-2 bg-navy-800 text-white text-sm font-semibold rounded-lg hover:bg-navy-700 transition disabled:opacity-50"
        >
          {saving ? "保存中..." : dirty ? "保存する" : "保存済み"}
        </button>
      </div>

      {/* School Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
        <div className="flex overflow-x-auto">
          {SCHOOL_TABS.map((tab) => {
            const active = tab.key === activeKey;
            const has = !!map[tab.key] && (
              !!map[tab.key].examFee.bankInfo || !!map[tab.key].examFee.qr ||
              !!map[tab.key].tuition.bankInfo || !!map[tab.key].tuition.qr
            );
            return (
              <button
                key={tab.key}
                onClick={() => setActiveKey(tab.key)}
                className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5
                  ${active ? "border-navy-700 text-navy-800 bg-navy-50" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
              >
                {tab.global && <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">共通</span>}
                {tab.name}
                {!tab.global && has && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="個別設定あり" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">
          {isGlobal
            ? "すべての学校で使われる既定の振込先です。"
            : "この学校だけの振込先。空欄の項目は全校共通の設定が使われます。"}
        </span>
        {!isGlobal && (
          <button
            onClick={resetSchool}
            className="px-3 py-1.5 bg-orange-100 text-orange-700 border border-orange-200 text-xs font-semibold rounded-lg hover:bg-orange-200 transition"
          >
            全校共通に戻す
          </button>
        )}
      </div>

      {loading ? (
        <div className="card text-center py-16 text-gray-400">読み込み中...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <PaymentCard title="受験料の振込先" hint="出願時（選考料の支払い）に学生へ表示されます。" method={current.examFee} onChange={(p) => update("examFee", p)} />
          <PaymentCard title="学費の振込先" hint="合格後の入学手続きで学生へ表示されます。" method={current.tuition} onChange={(p) => update("tuition", p)} />
        </div>
      )}
      {!loading && (
        <p className="text-xs text-gray-400 mt-3">
          ※ 振込先テキスト・QRコードの両方／片方を設定できます。QRは画像（PNG・JPG、〜500KB）をアップロードしてください（PayPay・微信・支付宝・NewAge等、決済アプリのQRが使えます）。
        </p>
      )}
    </div>
  );
}

function PaymentCard({ title, hint, method, onChange }: {
  title: string; hint: string; method: PayMethod; onChange: (p: Partial<PayMethod>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    if (!f.type.startsWith("image/")) { setErr("画像ファイルを選択してください"); return; }
    if (f.size > MAX_QR_BYTES) { setErr("画像が大きすぎます（500KBまで）。圧縮してください。"); return; }
    const reader = new FileReader();
    reader.onload = () => onChange({ qr: String(reader.result) });
    reader.readAsDataURL(f);
  };

  return (
    <div className="card">
      <h3 className="font-bold text-gray-800 mb-1">{title}</h3>
      <p className="text-xs text-gray-400 mb-4">{hint}</p>

      <label className="form-label">振込先（口座情報）</label>
      <textarea
        className="form-input text-sm min-h-[96px] resize-y font-mono"
        placeholder={"銀行名：〇〇銀行 〇〇支店\n口座種別：普通\n口座番号：1234567\n口座名義：学校法人〇〇学園"}
        value={method.bankInfo}
        onChange={(e) => onChange({ bankInfo: e.target.value })}
      />

      <label className="form-label mt-4">QRコード（決済アプリ用・任意）</label>
      {method.qr ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={method.qr} alt="QRコード" className="w-32 h-32 object-contain border border-gray-200 rounded-lg bg-white p-1" />
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-xs py-1.5 px-3">差し替え</button>
            <button type="button" onClick={() => onChange({ qr: null })} className="text-xs text-red-600 hover:text-red-700 font-semibold">削除</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-300 rounded-xl py-6 text-sm text-gray-500 hover:border-blue-400 hover:bg-blue-50 transition-colors">
          QRコード画像をアップロード
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
