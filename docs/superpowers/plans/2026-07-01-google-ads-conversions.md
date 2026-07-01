# Google Ads オフラインコンバージョン送信 実装計画（C-③）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. spec=`docs/superpowers/specs/2026-07-01-google-ads-conversions-design.md`。

**Goal:** gclid 付きの成果（出願・OC予約）を Google Ads のオフラインコンバージョンとして送信し、広告最適化に還元する（設定駆動・未設定なら no-op）。

**Architecture:** `lib/googleAds.ts` に純関数（`buildClickConversion`/`formatAdsDateTime`/`adsEnabled`）＋ 送信 `uploadClickConversion`（OAuth→uploadClickConversions API、try/catch で握る）。出願/OC予約の作成直後に fire-and-forget で呼ぶ（await しない・失敗は logError のみ、作成を壊さない）。既存 gclid 行の一括送信スクリプト。認証情報が未設定なら全経路 no-op。

**Tech Stack:** Next14/TS。`ENV`（`lib/env.ts`）に `GOOGLE_ADS_*` 追加。branch `chore/security-hardening`。unit=`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run`（vitest.setup が全 suite で DB push するため DB 接続必須。純ロジックでも同様）。tsc=`npx tsc --noEmit`。build env=`DATABASE_URL_BASE=...compass_test SESSION_SECRET=<36文字> CSRF_SECRET=<36文字> NODE_OPTIONS=--max-old-space-size=2048 npx next build`（SESSION_SECRET は min32、`x` だと build の一部で落ちる）。**push前 fetch+rebase。** Bash は毎回 cwd リセット → `cd /Users/setsuiken/senmon-fix &&` を必ず前置。

**設計上の確定判断（spec 承認済み）:** Google Ads のみ（Meta は将来）。送信対象＝出願＋OC予約の2コンバージョン。トリガ＝作成時 fire-and-forget＋backfill。ペイロード生成は純関数で unit。実疎通は認証情報投入後（ユーザー作業）。DB 書き込みなし・tenant 影響なし。

---

## Task 1: env 追加＋送信lib `lib/googleAds.ts` ＋ unit

**Files:**
- Modify: `lib/env.ts`（`ENV` に `GOOGLE_ADS_*` を追加）
- Create: `lib/googleAds.ts`
- Create: `tests/unit/google-ads.test.ts`

> `lib/env.ts` の `ENV` は `process.env.X || ""` 方式（`ANTHROPIC_API_KEY` 参照）。`aiEnabled()`（`lib/anthropic.ts`）と同じ「未設定 → false → no-op」方針を踏襲する。`logError(msg, err, ctx)` は `@/lib/logger`。

- [ ] **Step 1: `lib/env.ts` に環境変数を追加**

`ENV` オブジェクトの `ANTHROPIC_API_KEY` 行の直後（`} as const;` の前）に追加:

```ts
  // Google Ads オフラインコンバージョン送信。未設定(6点のいずれか欠け)なら送信は no-op。
  GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
  GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID || "",
  GOOGLE_ADS_CLIENT_SECRET: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
  GOOGLE_ADS_REFRESH_TOKEN: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
  GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID || "",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "",
  GOOGLE_ADS_CONV_APPLICATION: process.env.GOOGLE_ADS_CONV_APPLICATION || "",
  GOOGLE_ADS_CONV_OC: process.env.GOOGLE_ADS_CONV_OC || "",
```

- [ ] **Step 2: 失敗するテストを書く — `tests/unit/google-ads.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatAdsDateTime, buildClickConversion } from "@/lib/googleAds";

describe("formatAdsDateTime", () => {
  it("UTC を JST 壁時計 + '+09:00' に整形する", () => {
    // 2026-07-01T00:30:00Z → JST 09:30:00
    const d = new Date("2026-07-01T00:30:00.000Z");
    expect(formatAdsDateTime(d)).toBe("2026-07-01 09:30:00+09:00");
  });
  it("日付跨ぎ(UTC 前日夜 → JST 翌日)を正しく繰り上げる", () => {
    const d = new Date("2026-06-30T20:00:00.000Z"); // JST 2026-07-01 05:00
    expect(formatAdsDateTime(d)).toBe("2026-07-01 05:00:00+09:00");
  });
});

describe("buildClickConversion", () => {
  it("resource name / gclid / 日時を組む(value 無し)", () => {
    const c = buildClickConversion({
      gclid: "G123",
      conversionActionId: "456",
      customerId: "789",
      conversionDateTime: "2026-07-01 09:30:00+09:00",
    });
    expect(c).toEqual({
      conversionAction: "customers/789/conversionActions/456",
      gclid: "G123",
      conversionDateTime: "2026-07-01 09:30:00+09:00",
    });
  });
  it("value 指定時は conversionValue + currencyCode(既定 JPY)を付ける", () => {
    const c = buildClickConversion({
      gclid: "G1", conversionActionId: "2", customerId: "3",
      conversionDateTime: "2026-07-01 09:30:00+09:00", value: 5000,
    }) as Record<string, unknown>;
    expect(c.conversionValue).toBe(5000);
    expect(c.currencyCode).toBe("JPY");
  });
});

describe("adsEnabled / uploadClickConversion (no-op)", () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("認証情報未設定なら adsEnabled()=false", async () => {
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "");
    const { adsEnabled } = await import("@/lib/googleAds");
    expect(adsEnabled()).toBe(false);
  });

  it("未設定なら uploadClickConversion は fetch を呼ばず {ok:false}", async () => {
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { uploadClickConversion } = await import("@/lib/googleAds");
    const res = await uploadClickConversion({ gclid: "G1", conversionActionId: "2", at: new Date() });
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gclid 空なら enabled でも fetch を呼ばず {ok:false}", async () => {
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "dev");
    vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "sec");
    vi.stubEnv("GOOGLE_ADS_REFRESH_TOKEN", "ref");
    vi.stubEnv("GOOGLE_ADS_CUSTOMER_ID", "123");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { uploadClickConversion } = await import("@/lib/googleAds");
    const res = await uploadClickConversion({ gclid: "", conversionActionId: "2", at: new Date() });
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 実行して落ちることを確認**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/google-ads.test.ts`
Expected: FAIL（`@/lib/googleAds` が存在しない → import エラー）。

- [ ] **Step 4: `lib/googleAds.ts` を実装**

> `ENV` は `lib/env.ts` の静的読み取り。テストは `vi.stubEnv` + `vi.resetModules()` + 動的 import で env を差し替えるため、`adsEnabled()`/`uploadClickConversion` は **`process.env` を直接読む**（`ENV` 経由だと `lib/env.ts` が一度評価された値に固定され stub が効かない）。純関数（`formatAdsDateTime`/`buildClickConversion`）は env 非依存。

```ts
// =============================================================================
// Google Ads オフラインコンバージョン送信（設定駆動・未設定なら no-op）
//   - adsEnabled(): 認証6点が揃っているか。未設定なら送信経路は何もしない。
//   - buildClickConversion / formatAdsDateTime: 純関数（unit テスト対象）。
//   - uploadClickConversion: OAuth → uploadClickConversions API。例外は握って
//     {ok:false} を返す（呼び出し側の作成処理を絶対に壊さない）。
//   - DB 書き込みなし・外部送信のみ。tenant 非依存。
// =============================================================================
import { logError } from "@/lib/logger";

const GOOGLE_ADS_API_VERSION = "v17";

// process.env を直接読む（テストの stubEnv を効かせるため。ENV 経由にしない）
function creds() {
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID || "",
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "",
  };
}

export function adsEnabled(): boolean {
  const c = creds();
  return !!(c.developerToken && c.clientId && c.clientSecret && c.refreshToken && c.customerId);
}

/** Date → Google Ads の conversionDateTime 形式 "yyyy-MM-dd HH:mm:ss+09:00"（JST 壁時計）。 */
export function formatAdsDateTime(date: Date, tz = "+09:00"): string {
  // UTC に +9h して getUTC* で読むと JST の壁時計値になる（環境 TZ 非依存で決定的）。
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${jst.getUTCFullYear()}-${p(jst.getUTCMonth() + 1)}-${p(jst.getUTCDate())} ` +
    `${p(jst.getUTCHours())}:${p(jst.getUTCMinutes())}:${p(jst.getUTCSeconds())}${tz}`
  );
}

/** クリックコンバージョン1件のオブジェクトを組む（純関数）。 */
export function buildClickConversion(opts: {
  gclid: string;
  conversionActionId: string;
  customerId: string;
  conversionDateTime: string;
  value?: number;
  currency?: string;
}): Record<string, unknown> {
  const conv: Record<string, unknown> = {
    conversionAction: `customers/${opts.customerId}/conversionActions/${opts.conversionActionId}`,
    gclid: opts.gclid,
    conversionDateTime: opts.conversionDateTime,
  };
  if (opts.value != null) {
    conv.conversionValue = opts.value;
    conv.currencyCode = opts.currency ?? "JPY";
  }
  return conv;
}

/** OAuth refresh_token → access_token。失敗時は null。 */
async function getAccessToken(): Promise<string | null> {
  const c = creds();
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        refresh_token: c.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      logError("Google Ads OAuth token 取得失敗", new Error(`status ${res.status}`), {});
      return null;
    }
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch (e) {
    logError("Google Ads OAuth token 例外", e, {});
    return null;
  }
}

/**
 * gclid 付きコンバージョンを Google Ads に送信。
 * adsEnabled()==false / gclid 空 / conversionActionId 空 のいずれかで no-op（{ok:false}）。
 * 例外は握って {ok:false,error} を返す（呼び出し側の作成を壊さない）。
 */
export async function uploadClickConversion(opts: {
  gclid: string;
  conversionActionId: string;
  at: Date;
  value?: number;
  currency?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!adsEnabled() || !opts.gclid || !opts.conversionActionId) return { ok: false };
  const c = creds();
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "no access token" };
    const conversion = buildClickConversion({
      gclid: opts.gclid,
      conversionActionId: opts.conversionActionId,
      customerId: c.customerId,
      conversionDateTime: formatAdsDateTime(opts.at),
      value: opts.value,
      currency: opts.currency,
    });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": c.developerToken,
      "Content-Type": "application/json",
    };
    if (c.loginCustomerId) headers["login-customer-id"] = c.loginCustomerId;
    const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${c.customerId}:uploadClickConversions`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ conversions: [conversion], partialFailure: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logError("Google Ads uploadClickConversions 失敗", new Error(`status ${res.status}`), { body: body.slice(0, 500) });
      return { ok: false, error: `status ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    logError("Google Ads uploadClickConversion 例外", e, { gclid: opts.gclid });
    return { ok: false, error: String(e) };
  }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/google-ads.test.ts`
Expected: PASS（7 tests）。

- [ ] **Step 6: tsc**

Run: `cd /Users/setsuiken/senmon-fix && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 7: commit**

```bash
cd /Users/setsuiken/senmon-fix && git add lib/env.ts lib/googleAds.ts tests/unit/google-ads.test.ts && git commit -m "feat(ads): Google Ads クリックコンバージョン送信lib（設定駆動・未設定no-op）＋unit"
```

---

## Task 2: トリガ（出願・OC予約 作成後に fire-and-forget 送信）

**Files:**
- Modify: `app/api/applications/route.ts`（`db.application.create` の直後）
- Modify: `app/api/oc/reservations/route.ts`（`db.oCReservation.create` の直後）

> どちらも「作成成功 → `void uploadClickConversion(...).then(...)`（await しない）」。`adsEnabled()` false や gclid 無しなら lib 側で no-op。作成レスポンスを一切変えない。import は `ENV`（`@/lib/env`）と `uploadClickConversion`（`@/lib/googleAds`）。

- [ ] **Step 1: 出願作成後に送信を追加 — `app/api/applications/route.ts`**

ファイル冒頭の import 群に追加（既存 import の並びに合わせて）:

```ts
import { ENV } from "@/lib/env";
import { uploadClickConversion } from "@/lib/googleAds";
```

`const application = await db.application.create({ ... });`（現状 466–549 行）の**直後**、Prospect 自動マッチ（`try { const { linkProspectToApplication }...`）の**前**に挿入:

```ts
    // Google Ads: gclid 付き出願をオフラインコンバージョン送信（fire-and-forget・失敗しても出願は成功）
    if (application.gclid) {
      void uploadClickConversion({
        gclid: application.gclid,
        conversionActionId: ENV.GOOGLE_ADS_CONV_APPLICATION,
        at: application.createdAt,
      }).then((r) => {
        if (!r.ok && r.error) console.warn("Google Ads 出願CV送信 失敗:", r.error);
      });
    }
```

- [ ] **Step 2: 出願側の tsc 確認**

Run: `cd /Users/setsuiken/senmon-fix && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 3: OC予約作成の戻り値を捕捉して送信 — `app/api/oc/reservations/route.ts`**

まず現状の `await db.oCReservation.create({ ... })`（55 行〜）を戻り値付きに変更:

```ts
    const reservation = await db.oCReservation.create({
```

（`data:` 以下は変更しない。閉じ括弧までそのまま。）

ファイル冒頭 import に追加:

```ts
import { ENV } from "@/lib/env";
import { uploadClickConversion } from "@/lib/googleAds";
```

そして `create` の閉じ括弧の直後（cancelUrl / メール送信ブロックの前後どちらでもよいが、`return NextResponse.json(...)` の前）に挿入:

```ts
    // Google Ads: gclid 付き OC予約をオフラインコンバージョン送信（fire-and-forget）
    if (reservation.gclid) {
      void uploadClickConversion({
        gclid: reservation.gclid,
        conversionActionId: ENV.GOOGLE_ADS_CONV_OC,
        at: reservation.createdAt,
      }).then((r) => {
        if (!r.ok && r.error) console.warn("Google Ads OC予約CV送信 失敗:", r.error);
      });
    }
```

> 注: 既存コードが `reservationNo` を `body`/ローカルから使っているなら変更不要。`reservation.createdAt`/`reservation.gclid` は Prisma の戻り値スカラ。もし既存で `create` の結果を使っていない場合のみ `const reservation =` 化する。

- [ ] **Step 4: OC側の tsc 確認**

Run: `cd /Users/setsuiken/senmon-fix && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 5: build で両ルートがコンパイルされることを確認**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" SESSION_SECRET=build-session-secret-32chars-abcdef00 CSRF_SECRET=build-csrf-secret-32chars-abcdef0000 NODE_OPTIONS=--max-old-space-size=2048 npx next build`
Expected: ✓ Compiled successfully（`/api/applications` と `/api/oc/reservations` がルートマニフェストに存在）。

- [ ] **Step 6: 既存の出願/OC の e2e/unit 非回帰**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/apply-flow.test.ts tests/unit/oc-form.test.ts tests/unit/google-ads.test.ts`
Expected: すべて PASS（未設定環境では送信は no-op なので出願/OC 挙動は不変）。

- [ ] **Step 7: commit**

```bash
cd /Users/setsuiken/senmon-fix && git add app/api/applications/route.ts app/api/oc/reservations/route.ts && git commit -m "feat(ads): 出願・OC予約作成時にGoogle Adsコンバージョンをfire-and-forget送信"
```

---

## Task 3: backfill スクリプト `scripts/upload-conversions.ts` ＋検証＋push

**Files:**
- Create: `scripts/upload-conversions.ts`

> 既存の gclid 付き Application / OCReservation を Google Ads に送信（一回限り・冪等寄り。Google Ads 側が gclid+アクション+時刻で dedup）。`adsEnabled()` false なら警告して 0 件終了。DB は生の `PrismaClient`（スクリプトは tenant コンテキスト外。全 org を対象にしてよい＝運用者が実行する backfill）。引数 `--from=YYYY-MM-DD`（既定 過去30日）・`--type=application|oc|all`（既定 all）。

- [ ] **Step 1: `scripts/upload-conversions.ts` を実装**

```ts
/**
 * Google Ads オフラインコンバージョン backfill。
 * 既存の gclid 付き Application / OCReservation を送信する（一回限り・冪等寄り）。
 * 使い方:
 *   DATABASE_URL=... GOOGLE_ADS_...（認証6点+アクションID） \
 *   npx tsx scripts/upload-conversions.ts --type=all --from=2026-06-01
 * 認証情報が未設定なら 0 件で終了。
 */
import { PrismaClient } from "@prisma/client";
import { adsEnabled, uploadClickConversion } from "@/lib/googleAds";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  if (!adsEnabled()) {
    console.warn("[backfill] Google Ads 認証情報が未設定です。0 件で終了します。");
    return;
  }
  const type = (arg("type") || "all").toLowerCase();
  const fromStr = arg("from");
  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (isNaN(from.getTime())) {
    console.error(`[backfill] --from の日付が不正: ${fromStr}`);
    process.exit(1);
  }
  const convApp = process.env.GOOGLE_ADS_CONV_APPLICATION || "";
  const convOc = process.env.GOOGLE_ADS_CONV_OC || "";
  const prisma = new PrismaClient();
  let sent = 0, skipped = 0, failed = 0;

  try {
    if ((type === "all" || type === "application") && convApp) {
      const apps = await prisma.application.findMany({
        where: { gclid: { not: null }, createdAt: { gte: from } },
        select: { id: true, gclid: true, createdAt: true },
      });
      console.log(`[backfill] 出願 ${apps.length} 件（gclid 付き, from=${from.toISOString().slice(0, 10)}）`);
      for (const a of apps) {
        if (!a.gclid) { skipped++; continue; }
        const r = await uploadClickConversion({ gclid: a.gclid, conversionActionId: convApp, at: a.createdAt });
        if (r.ok) sent++; else failed++;
      }
    } else if (type === "all" || type === "application") {
      console.warn("[backfill] GOOGLE_ADS_CONV_APPLICATION 未設定 → 出願はスキップ");
    }

    if ((type === "all" || type === "oc") && convOc) {
      const rs = await prisma.oCReservation.findMany({
        where: { gclid: { not: null }, createdAt: { gte: from } },
        select: { id: true, gclid: true, createdAt: true },
      });
      console.log(`[backfill] OC予約 ${rs.length} 件（gclid 付き）`);
      for (const r0 of rs) {
        if (!r0.gclid) { skipped++; continue; }
        const r = await uploadClickConversion({ gclid: r0.gclid, conversionActionId: convOc, at: r0.createdAt });
        if (r.ok) sent++; else failed++;
      }
    } else if (type === "all" || type === "oc") {
      console.warn("[backfill] GOOGLE_ADS_CONV_OC 未設定 → OC予約はスキップ");
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`[backfill] 完了: 送信=${sent} 失敗=${failed} スキップ=${skipped}`);
}

main().catch((e) => {
  console.error("[backfill] 予期せぬエラー:", e);
  process.exit(1);
});
```

- [ ] **Step 2: 未設定環境で安全に 0 件終了することを確認**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL=postgresql://setsuiken@localhost:5432/compass_test npx tsx scripts/upload-conversions.ts --type=all`
Expected: `[backfill] Google Ads 認証情報が未設定です。0 件で終了します。`（認証 env 無し → adsEnabled()=false → 即終了、DB 接続も送信もしない）。

- [ ] **Step 3: tsc（スクリプト込み）**

Run: `cd /Users/setsuiken/senmon-fix && npx tsc --noEmit`
Expected: 0 errors。（`tsconfig` が `scripts/` を含むか確認。含まなければ `npx tsc --noEmit scripts/upload-conversions.ts` 相当は不要 — 既存 scripts と同じ扱いで可。既存 `scripts/*.ts` が tsc 対象外なら本 step は「既存スクリプトと同様に型は tsx 実行時解決」で可、Step 2 の実行成功をもって代替。）

- [ ] **Step 4: commit**

```bash
cd /Users/setsuiken/senmon-fix && git add scripts/upload-conversions.ts && git commit -m "feat(ads): 既存gclid行のGoogle Adsコンバージョン backfillスクリプト"
```

- [ ] **Step 5: push（fetch+rebase 必須）**

```bash
cd /Users/setsuiken/senmon-fix && git fetch origin && git rebase origin/chore/security-hardening
```
コンフリクトが出たら解消（本機能は `lib/env.ts`/`lib/googleAds.ts`/2ルート/スクリプト/新規テストのみ。`lib/env.ts` は tenant 作業と衝突し得る → 両方の env を残してマージ）。クリーンな rebase 後:
```bash
cd /Users/setsuiken/senmon-fix && git push origin chore/security-hardening
```

---

## 受け入れ基準
- 認証情報が設定されていれば、出願・OC予約作成時に gclid 付きコンバージョンが Google Ads に fire-and-forget 送信される。未設定なら全経路 no-op で既存フロー非破壊。
- backfill で既存 gclid 行を送信できる（未設定なら 0 件終了）。
- unit（`google-ads.test.ts` 7件）＋既存 apply/oc テスト緑、tsc 0、build 成功。

## Self-Review
- **spec 網羅:** ①env→T1 Step1。②lib(adsEnabled/getAccessToken/buildClickConversion/formatAdsDateTime/uploadClickConversion)→T1 Step4。③トリガ(出願/OC)→T2。④backfill→T3。⑤運用前提→本番 env 投入(ユーザー作業、コード対象外)。テスト(unit/no-op/build)→各 Step。
- **プレースホルダ無し:** 全コード実体記載。
- **型一貫:** `uploadClickConversion({gclid,conversionActionId,at,value?,currency?})`、`buildClickConversion({gclid,conversionActionId,customerId,conversionDateTime,value?,currency?})`、`formatAdsDateTime(date,tz?)`、`adsEnabled():boolean` — T1 定義と T2/T3 呼び出しが一致。`ENV.GOOGLE_ADS_CONV_APPLICATION`/`_OC` を T2 で使用（T1 Step1 で追加）。
- **後方互換:** 送信は fire-and-forget＋no-op ゲートで既存の出願/OC/レスポンスに影響なし。
- **注意点:** `adsEnabled`/creds は `process.env` 直読み（テスト stubEnv 対応。`ENV` 経由にしない）。`SESSION_SECRET` は build で min32 必須。OC は `create` 戻り値を `const reservation =` で捕捉。
