/**
 * 既存の全フォーム項目ラベル/ヒントを一括で英訳し labelEn/descriptionEn を埋める（一回限り・再実行安全）。
 * 使い方:  cd /srv/senmon/app && npx tsx scripts/translate-all-labels.ts        （未翻訳のみ）
 *          npx tsx scripts/translate-all-labels.ts --force                      （全件再翻訳）
 * 前提: ANTHROPIC_API_KEY が .env に設定済み。未設定なら何もしない（0件）。
 * 方針: 同一ラベルは一度だけ翻訳→同名の全行に適用（コスト最小）。40件ずつ HAIKU バッチ。
 */
import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const KEY = process.env.ANTHROPIC_API_KEY;
const prisma = new PrismaClient();
const CHUNK = 40;

function parseJsonLoose(text: string): Record<string, unknown> | null {
  const tryP = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  const d = tryP(text.trim());
  if (d && typeof d === "object") return d;
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { const o = tryP(text.slice(a, b + 1)); if (o && typeof o === "object") return o; }
  return null;
}

async function translateChunk(jas: string[]): Promise<Record<string, string>> {
  if (!KEY || jas.length === 0) return {};
  const client = new Anthropic({ apiKey: KEY });
  const system =
    "You translate Japanese form-field labels/hints into concise, natural English UI text. " +
    "Return ONLY a JSON object mapping each given Japanese string to its English translation. " +
    "Keep each short and label-like (Title Case where natural). No notes, no code fences.";
  const user = "Translate each Japanese string to English. Return JSON {japanese: english}.\n" + JSON.stringify(jas);
  const msg = await client.messages.create({ model: "claude-haiku-4-5", max_tokens: 4000, system, messages: [{ role: "user", content: user }] });
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const obj = parseJsonLoose(text);
  const out: Record<string, string> = {};
  if (obj) for (const ja of jas) { const v = (obj as any)[ja]; if (typeof v === "string" && v.trim()) out[ja] = v.trim(); }
  return out;
}

async function translateAll(uniq: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const chunk = uniq.slice(i, i + CHUNK);
    Object.assign(map, await translateChunk(chunk));
    console.log(`  翻訳 ${Math.min(i + CHUNK, uniq.length)}/${uniq.length}`);
  }
  return map;
}

async function main() {
  const force = process.argv.includes("--force");
  if (!KEY) console.log("⚠ ANTHROPIC_API_KEY 未設定 → 翻訳は行われません（0件）。本番では .env に設定して実行してください。");

  const rows = await prisma.formFieldConfig.findMany({
    select: { id: true, label: true, description: true, labelEn: true, descriptionEn: true },
  });
  const needLabel = new Set<string>(), needDesc = new Set<string>();
  for (const r of rows) {
    if (r.label?.trim() && (force || !r.labelEn)) needLabel.add(r.label.trim());
    if (r.description?.trim() && (force || !r.descriptionEn)) needDesc.add(r.description.trim());
  }
  console.log(`対象行: ${rows.length} / ユニーク ラベル ${needLabel.size}・ヒント ${needDesc.size}`);

  const labelMap = await translateAll(Array.from(needLabel));
  const descMap = await translateAll(Array.from(needDesc));

  let updated = 0;
  for (const r of rows) {
    const data: { labelEn?: string; descriptionEn?: string } = {};
    const le = r.label && labelMap[r.label.trim()];
    const de = r.description && descMap[r.description.trim()];
    if (le && (force || !r.labelEn)) data.labelEn = le;
    if (de && (force || !r.descriptionEn)) data.descriptionEn = de;
    if (Object.keys(data).length) { await prisma.formFieldConfig.update({ where: { id: r.id }, data }); updated++; }
  }
  console.log(`✓ 完了: ${updated} 行を更新（labelEn/descriptionEn）`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
