import { aiEnabled, generateText, HAIKU, parseJsonLoose } from "@/lib/anthropic";

/**
 * 日本語のフォーム項目ラベル/ヒントを英訳し、key→英語 のマップを返す。
 * - ANTHROPIC_API_KEY 未設定（aiEnabled()=false）や対象なし → {}（no-op、安全）。
 * - 1回のバッチ呼び出し（HAIKU）。失敗時も {} を返す（保存処理を壊さない）。
 */
export async function translateLabelsToEn(items: { key: string; ja: string }[]): Promise<Record<string, string>> {
  const targets = items.filter((i) => i.ja && i.ja.trim());
  if (!aiEnabled() || targets.length === 0) return {};
  const system =
    "You translate Japanese form-field labels/hints into concise, natural English UI text. " +
    "Return ONLY a JSON object mapping each given key to its English translation. " +
    "Keep each translation short and label-like (Title Case where natural). No notes, no code fences.";
  const user =
    "Translate these Japanese form labels to English. Return JSON {key: english}.\n" +
    JSON.stringify(targets.map((t) => ({ key: t.key, ja: t.ja })));
  try {
    const { text } = await generateText({ system, user, model: HAIKU, maxTokens: 1500 });
    const obj = parseJsonLoose<Record<string, unknown>>(text);
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, string> = {};
    for (const t of targets) {
      const v = obj[t.key];
      if (typeof v === "string" && v.trim()) out[t.key] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}
