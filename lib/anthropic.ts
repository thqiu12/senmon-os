// =============================================================================
// Anthropic 共有ヘルパー
//   - APIキー未設定なら aiEnabled()=false。各機能は呼ぶ前にこれで判定し、
//     未設定時は UI に出さない / API は 400 を返す。
//   - generateText: system + user(テキスト or マルチモーダル) → テキスト。
//   - parseJsonLoose: モデル出力から JSON を寛容に抽出。
// =============================================================================
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "@/lib/env";

export const HAIKU = "claude-haiku-4-5";
export const SONNET = "claude-sonnet-4-6";

export function aiEnabled(): boolean {
  return !!ENV.ANTHROPIC_API_KEY;
}

export function getClient(): Anthropic {
  return new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY });
}

export interface GenResult {
  text: string;
  usage: { input: number; output: number };
}

export async function generateText(opts: {
  system: string;
  user: string | Anthropic.ContentBlockParam[];
  model?: string;
  maxTokens?: number;
}): Promise<GenResult> {
  const client = getClient();
  const msg = await client.messages.create({
    model: opts.model || HAIKU,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  return { text, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}

/** モデルが前後に説明文やコードフェンスを付けても JSON を取り出す。 */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return direct;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return tryParse(text.slice(first, last + 1));
  return null;
}
