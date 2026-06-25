/**
 * SQLite → Postgres データ移行(本番カットオーバー Task6 用・一回限り)
 *
 * 使い方:
 *   OLD_DATABASE_URL="file:./prisma/prisma/data.db" \
 *   DATABASE_URL="<postgres>" DIRECT_URL="<postgres>" \
 *   npx tsx prisma/migrate-sqlite-to-pg.ts [--wipe]
 *
 * 前提: 移行先 Postgres には既にスキーマが適用済み(prisma migrate deploy / db push)。
 *
 * 方針:
 *  - 既存 schema.prisma(postgresql)から SQLite 用クライアントを派生生成(スキーマのドリフト無し)
 *  - 全モデルを FK 依存順(親→子)にコピー、ID(cuid)を保持
 *  - createMany + skipDuplicates で再実行に強い(途中失敗しても再開可)
 *  - 末尾で全モデルの件数を突き合わせ、不一致があれば exit 1
 *
 *  --wipe を付けると移行先の既存データを子→親順に全削除してから入れ直す。
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PrismaClient as PgClient, Prisma } from "@prisma/client";

const require = createRequire(import.meta.url);
const SQLITE_OUT = path.join(process.cwd(), "node_modules/.prisma/client-sqlite");
const SQLITE_SCHEMA = path.join(process.cwd(), "prisma/.schema.sqlite.generated.prisma");
const BATCH = 500;

const delegate = (modelName: string) => modelName.charAt(0).toLowerCase() + modelName.slice(1);

/** schema.prisma から SQLite 用スキーマを派生し、専用クライアントを生成 */
function generateSqliteClient(): void {
  if (!process.env.OLD_DATABASE_URL) {
    throw new Error('OLD_DATABASE_URL(元の SQLite。例: "file:./prisma/prisma/data.db")が未設定です');
  }
  let s = readFileSync("prisma/schema.prisma", "utf8");
  // Phase3 で追加した extraData(Json)/options(String) は、旧 SQLite 本番には存在せず、
  // かつ Json 型は SQLite provider で未対応（prisma generate が失敗する）。
  // 読み取り用 SQLite スキーマからは除外する（移行先 Postgres は migrate deploy で
  // 作成済み・null 既定なので、これらに旧データは無く欠損も起きない）。
  s = s.replace(/^[ \t]*extraData[ \t]+Json\??.*$/m, "");
  s = s.replace(/^[ \t]*options[ \t]+String\??.*$/m, "");
  s = s.replace(
    /datasource\s+db\s*\{[\s\S]*?\}/,
    'datasource db {\n  provider = "sqlite"\n  url      = env("OLD_DATABASE_URL")\n}',
  );
  s = s.replace(
    /generator\s+client\s*\{[\s\S]*?\}/,
    `generator client {\n  provider = "prisma-client-js"\n  output   = "${SQLITE_OUT}"\n}`,
  );
  writeFileSync(SQLITE_SCHEMA, s);
  execSync(`npx prisma generate --schema "${SQLITE_SCHEMA}"`, { stdio: "inherit" });
}

/** FK 依存順(親が先)に並べる。自己参照は順序付けから除外し警告する。 */
function topoSort(models: readonly any[]): { order: any[]; selfRefs: string[] } {
  const byName = new Map(models.map((m) => [m.name, m]));
  const visited = new Set<string>();
  const order: any[] = [];
  const selfRefs: string[] = [];
  const visit = (m: any, stack: Set<string>) => {
    if (visited.has(m.name) || stack.has(m.name)) return; // 訪問済み / 循環ガード
    stack.add(m.name);
    for (const f of m.fields) {
      if (f.kind === "object" && f.relationFromFields && f.relationFromFields.length > 0) {
        if (f.type === m.name) {
          if (!selfRefs.includes(m.name)) selfRefs.push(m.name);
          continue;
        }
        const dep = byName.get(f.type);
        if (dep) visit(dep, stack);
      }
    }
    stack.delete(m.name);
    visited.add(m.name);
    order.push(m);
  };
  for (const m of models) visit(m, new Set());
  return { order, selfRefs };
}

async function main() {
  const wipe = process.argv.includes("--wipe");
  generateSqliteClient();
  const { PrismaClient: SqlitePrisma } = require(SQLITE_OUT);

  const sqlite = new SqlitePrisma();
  const pg = new PgClient();

  const { order, selfRefs } = topoSort(Prisma.dmmf.datamodel.models);
  if (selfRefs.length) {
    console.warn(`⚠ 自己参照モデル(行の挿入順に注意・要手動確認): ${selfRefs.join(", ")}`);
  }

  if (wipe) {
    for (const m of [...order].reverse()) {
      await (pg as any)[delegate(m.name)].deleteMany({});
    }
    console.log("移行先 Postgres の既存データを削除しました(--wipe)\n");
  }

  console.log("モデル                      SQLite →  Postgres");
  console.log("------------------------------------------------");
  let mismatch = 0;
  for (const m of order) {
    const d = delegate(m.name);
    const rows: any[] = await (sqlite as any)[d].findMany();
    for (let i = 0; i < rows.length; i += BATCH) {
      await (pg as any)[d].createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
    }
    const src: number = await (sqlite as any)[d].count();
    const dst: number = await (pg as any)[d].count();
    const ok = src === dst;
    if (!ok) mismatch++;
    console.log(`${ok ? "✓" : "✗"} ${m.name.padEnd(24)} ${String(src).padStart(6)} → ${String(dst).padStart(6)}`);
  }

  await sqlite.$disconnect();
  await pg.$disconnect();

  if (mismatch) {
    console.error(`\n✗ ${mismatch} モデルで件数が一致しません。移行先を確認してください。`);
    process.exit(1);
  }
  console.log("\n✓ 全モデルの件数が一致しました。データ移行完了。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
