"use client";

import { useEffect, useState } from "react";
import { useUI } from "@/components/ui/toast";

interface Summary {
  summary: string;
  recommendation: string;
  reasons: string[];
  divergence: string | null;
  confidence: "high" | "medium" | "low";
}
interface State {
  aiEnabled: boolean;
  hasFeedback: boolean;
  feedbackCount: number;
  summary: Summary | null;
  generatedAt: string | null;
  model: string | null;
}

const REC_STYLE: Record<string, string> = {
  合格: "bg-green-100 text-green-800 border-green-300",
  補欠合格: "bg-amber-100 text-amber-800 border-amber-300",
  不合格: "bg-red-100 text-red-800 border-red-300",
  保留: "bg-gray-100 text-gray-700 border-gray-300",
};
const CONF_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

export function InterviewSummaryCard({ applicationId }: { applicationId: string }) {
  const { toast } = useUI();
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${applicationId}/interview-summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setState(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applicationId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/interview-summary`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "生成に失敗しました");
      setState((prev) => prev && { ...prev, summary: d.summary, generatedAt: d.generatedAt, model: d.model });
      toast("AI講評を生成しました", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "生成に失敗しました", "error");
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !state) return null;
  // フィードバックが無ければ講評対象なし → 非表示
  if (!state.hasFeedback) return null;

  const s = state.summary;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide">面接講評（AI・判断材料）</h3>
        {state.aiEnabled ? (
          <button
            onClick={generate}
            disabled={generating}
            className="text-xs bg-navy-800 text-white px-3 py-1.5 rounded-lg hover:bg-navy-700 disabled:opacity-50"
          >
            {generating ? "生成中..." : s ? "再生成" : "AIで講評・合否提案を生成"}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">未設定（ANTHROPIC_API_KEY）</span>
        )}
      </div>

      {!s ? (
        <p className="text-xs text-gray-400">
          面接フィードバック{state.feedbackCount}件を合成して、講評と推奨合否（判断材料）を生成します。最終決定は行いません。
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">推奨合否</span>
            <span className={`text-sm px-3 py-1 rounded-full font-bold border ${REC_STYLE[s.recommendation] || REC_STYLE["保留"]}`}>
              {s.recommendation}
            </span>
            <span className="text-[11px] text-gray-400">確信度: {CONF_LABEL[s.confidence] || s.confidence}</span>
            <span className="text-[11px] text-amber-700 ml-auto">※ 提案です。決定は担当者が行ってください</span>
          </div>

          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
            {s.summary}
          </p>

          {s.reasons?.length > 0 && (
            <ul className="space-y-1">
              {s.reasons.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-navy-500 shrink-0">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}

          {s.divergence && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <span className="font-semibold">⚠️ 面接官間の評価差: </span>{s.divergence}
            </div>
          )}

          {state.generatedAt && (
            <p className="text-[11px] text-gray-400">
              生成: {new Date(state.generatedAt).toLocaleString("ja-JP")}（{state.model || "AI"}）
            </p>
          )}
        </div>
      )}
    </div>
  );
}
