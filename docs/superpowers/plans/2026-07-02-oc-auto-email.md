# OC自動メール（リマインド／フォロー／出願案内）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. spec=`docs/superpowers/specs/2026-07-02-oc-auto-email-design.md`。

**Goal:** OC予約者へ 前日リマインド／出席御礼＋出願案内／欠席フォロー／未出願フォロー を日次 cron で自動送信し、出席率と予約→出願転換を底上げする。文面は管理画面で編集可能。

**Architecture:** 純関数 `renderTemplate`/`parseTemplates`（`lib/ocEmailTemplates.ts`）＋対象抽出純関数 `selectDueReminders`（`lib/ocReminders.ts`）。テンプレは SystemSetting JSON（key=`oc_email_templates`）。送信は cron スクリプト `scripts/oc-send-reminders.ts`（`sendEmail` 再利用、成功時のみ OCReservation の送信済みフラグを stamp）。管理 UI は OC 管理ページに「自動メール」タブ追加。

**Tech Stack:** Next14/TS/Prisma/Postgres。branch `chore/security-hardening`。unit=`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run`。tsc=`npx tsc --noEmit`。build env=`DATABASE_URL_BASE=...compass_test SESSION_SECRET=<36文字> CSRF_SECRET=<36文字> NODE_OPTIONS=--max-old-space-size=2048 npx next build`。**push前 fetch+rebase。** Bash は毎回 cwd リセット → `cd /Users/setsuiken/senmon-fix &&` を必ず前置。tenant: 管理APIは `withTenant`＋`getTenantDb`（`@/lib/tenant/*`）。cron スクリプトは生 `PrismaClient`（backfill と同方針・tenant 外）。

> **重要（マイグレーション）:** schema の `organizationId` は nullable だが本番マイグレーションは NOT NULL+FK（意図的な差分・既存戦略）。`prisma migrate dev` を使うと この差分を「修正」する巨大 migration を生成してしまうため **使わない**。既存の追加式 migration（`20260701100000_application_attribution/migration.sql` = `ALTER TABLE ... ADD COLUMN`）と同じく **手書き SQL** で追加する。

---

## Task 1: スキーマ＋マイグレーション（OCReservation 送信済みフラグ4列）

**Files:**
- Modify: `prisma/schema.prisma`（model OCReservation）
- Create: `prisma/migrations/20260702120000_oc_reservation_mail_flags/migration.sql`

- [ ] **Step 1: schema に4列追加**

`model OCReservation { ... }` の `canceledAt DateTime?` 行の直後に追加:

```prisma
  reminderSentAt      DateTime? // 前日リマインド送信済み
  attendedMailSentAt  DateTime? // 出席御礼＋出願案内 送信済み
  absentMailSentAt    DateTime? // 欠席フォロー 送信済み
  unappliedMailSentAt DateTime? // 未出願フォロー 送信済み
```

- [ ] **Step 2: 手書きマイグレーション SQL 作成**

`prisma/migrations/20260702120000_oc_reservation_mail_flags/migration.sql`:

```sql
ALTER TABLE "OCReservation" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "OCReservation" ADD COLUMN "attendedMailSentAt" TIMESTAMP(3);
ALTER TABLE "OCReservation" ADD COLUMN "absentMailSentAt" TIMESTAMP(3);
ALTER TABLE "OCReservation" ADD COLUMN "unappliedMailSentAt" TIMESTAMP(3);
```

- [ ] **Step 3: Prisma client 再生成＋テストDBへ反映**

Run:
```bash
cd /Users/setsuiken/senmon-fix && DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_test" DIRECT_URL="postgresql://setsuiken@localhost:5432/compass_test" npx prisma generate && DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_test" DIRECT_URL="postgresql://setsuiken@localhost:5432/compass_test" npx prisma db push --skip-generate
```
Expected: generate 成功、`db push` が新4列を適用（「already in sync」ではなく列追加、またはテストDB次第で in sync）。エラーなし。

- [ ] **Step 4: tsc**

Run: `cd /Users/setsuiken/senmon-fix && npx tsc --noEmit`
Expected: 0 errors（型に4列反映）。

- [ ] **Step 5: commit**

```bash
cd /Users/setsuiken/senmon-fix && git add prisma/schema.prisma prisma/migrations/20260702120000_oc_reservation_mail_flags && git commit -m "feat(oc): OCReservationに自動メール送信済みフラグ4列（追加式マイグレーション）"
```

---

## Task 2: テンプレート lib `lib/ocEmailTemplates.ts` ＋ unit

**Files:**
- Create: `lib/ocEmailTemplates.ts`
- Create: `tests/unit/oc-email-templates.test.ts`

- [ ] **Step 1: 失敗するテストを書く — `tests/unit/oc-email-templates.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { renderTemplate, parseTemplates, OC_EMAIL_KEYS, OC_EMAIL_DEFAULTS } from "@/lib/ocEmailTemplates";

describe("renderTemplate", () => {
  it("{{var}} を置換する", () => {
    expect(renderTemplate("こんにちは {{name}} 様（{{eventTitle}}）", { name: "田中", eventTitle: "OC体験" }))
      .toBe("こんにちは 田中 様（OC体験）");
  });
  it("未知プレースホルダは空文字にする", () => {
    expect(renderTemplate("{{name}}/{{missing}}", { name: "A" })).toBe("A/");
  });
  it("プレースホルダが無ければそのまま", () => {
    expect(renderTemplate("固定文言", {})).toBe("固定文言");
  });
});

describe("parseTemplates", () => {
  it("未設定(null)なら全キー既定を返す", () => {
    const t = parseTemplates(null);
    expect(Object.keys(t).sort()).toEqual([...OC_EMAIL_KEYS].sort());
    expect(t.reminder.subject).toBe(OC_EMAIL_DEFAULTS.reminder.subject);
    expect(t.reminder.enabled).toBe(OC_EMAIL_DEFAULTS.reminder.enabled);
  });
  it("不正JSONでも既定にフォールバック", () => {
    const t = parseTemplates("{ not json");
    expect(t.attendedApply.body).toBe(OC_EMAIL_DEFAULTS.attendedApply.body);
  });
  it("部分指定はマージ（欠損は既定・enabledはboolean強制）", () => {
    const raw = JSON.stringify({ reminder: { enabled: false, subject: "カスタム件名" } });
    const t = parseTemplates(raw);
    expect(t.reminder.enabled).toBe(false);
    expect(t.reminder.subject).toBe("カスタム件名");
    expect(t.reminder.body).toBe(OC_EMAIL_DEFAULTS.reminder.body); // 欠損→既定
    expect(t.absentFollowup.subject).toBe(OC_EMAIL_DEFAULTS.absentFollowup.subject);
  });
  it("enabled が boolean でなければ既定を使う", () => {
    const raw = JSON.stringify({ reminder: { enabled: "yes" } });
    expect(parseTemplates(raw).reminder.enabled).toBe(OC_EMAIL_DEFAULTS.reminder.enabled);
  });
});
```

- [ ] **Step 2: 実行して落ちることを確認**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/oc-email-templates.test.ts`
Expected: FAIL（`@/lib/ocEmailTemplates` 未作成）。

- [ ] **Step 3: `lib/ocEmailTemplates.ts` を実装**

```ts
// OC自動メールのテンプレート。SystemSetting(key=oc_email_templates) に4キーの JSON で保存。
// 差し込みは renderTemplate（{{var}} 置換）。未設定/欠損は OC_EMAIL_DEFAULTS へフォールバック。
export type OCEmailKey = "reminder" | "attendedApply" | "absentFollowup" | "unappliedFollowup";
export type OCEmailTemplate = { enabled: boolean; subject: string; body: string };

export const OC_EMAIL_KEYS: OCEmailKey[] = ["reminder", "attendedApply", "absentFollowup", "unappliedFollowup"];

export const OC_EMAIL_SETTING_KEY = "oc_email_templates";

// 利用可能変数: {{name}} {{eventTitle}} {{startAt}} {{schoolName}} {{applyUrl}} {{cancelUrl}}
export const OC_EMAIL_DEFAULTS: Record<OCEmailKey, OCEmailTemplate> = {
  reminder: {
    enabled: true,
    subject: "【{{schoolName}}】明日のオープンキャンパスのご案内",
    body:
      "{{name}} 様\n\n" +
      "明日 {{startAt}} 開催のオープンキャンパス「{{eventTitle}}」のご予約ありがとうございます。\n" +
      "お気をつけてお越しください。\n\n" +
      "※ご都合が悪くなった場合はこちらからご確認ください: {{cancelUrl}}",
  },
  attendedApply: {
    enabled: true,
    subject: "【{{schoolName}}】オープンキャンパスご参加ありがとうございました",
    body:
      "{{name}} 様\n\n" +
      "本日はオープンキャンパス「{{eventTitle}}」にご参加いただきありがとうございました。\n" +
      "ご出願はこちらから承っております:\n{{applyUrl}}",
  },
  absentFollowup: {
    enabled: true,
    subject: "【{{schoolName}}】次回オープンキャンパスのご案内",
    body:
      "{{name}} 様\n\n" +
      "先日はオープンキャンパス「{{eventTitle}}」へのご予約ありがとうございました。\n" +
      "次回もぜひご参加ください。ご不明点はお気軽にお問い合わせください。",
  },
  unappliedFollowup: {
    enabled: true,
    subject: "【{{schoolName}}】ご出願について",
    body:
      "{{name}} 様\n\n" +
      "先日はオープンキャンパスにご参加いただきありがとうございました。\n" +
      "ご出願をご検討中でしたら、こちらから承っております:\n{{applyUrl}}",
  },
};

export function renderTemplate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (k in vars ? vars[k] : ""));
}

export function parseTemplates(raw: string | null | undefined): Record<OCEmailKey, OCEmailTemplate> {
  let obj: unknown = {};
  if (raw) {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  const src = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
  const out = {} as Record<OCEmailKey, OCEmailTemplate>;
  for (const k of OC_EMAIL_KEYS) {
    const d = OC_EMAIL_DEFAULTS[k];
    const v = src[k] && typeof src[k] === "object" ? (src[k] as Record<string, unknown>) : {};
    out[k] = {
      enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
      subject: typeof v.subject === "string" && v.subject ? v.subject : d.subject,
      body: typeof v.body === "string" && v.body ? v.body : d.body,
    };
  }
  return out;
}

// PUT 保存時の sanitize（4キー・enabled boolean・subject/body string）。常に4キー揃う。
export function sanitizeTemplates(input: unknown): Record<OCEmailKey, OCEmailTemplate> {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out = {} as Record<OCEmailKey, OCEmailTemplate>;
  for (const k of OC_EMAIL_KEYS) {
    const d = OC_EMAIL_DEFAULTS[k];
    const v = src[k] && typeof src[k] === "object" ? (src[k] as Record<string, unknown>) : {};
    out[k] = {
      enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
      subject: typeof v.subject === "string" ? v.subject : d.subject,
      body: typeof v.body === "string" ? v.body : d.body,
    };
  }
  return out;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/oc-email-templates.test.ts`
Expected: PASS（全ケース）。

- [ ] **Step 5: tsc＋commit**

```bash
cd /Users/setsuiken/senmon-fix && npx tsc --noEmit && git add lib/ocEmailTemplates.ts tests/unit/oc-email-templates.test.ts && git commit -m "feat(oc): 自動メールのテンプレートlib（既定/parse/render/sanitize）＋unit"
```

---

## Task 3: 対象抽出 `lib/ocReminders.ts` ＋ unit

**Files:**
- Create: `lib/ocReminders.ts`
- Create: `tests/unit/oc-reminders.test.ts`

> JST の「日」で判定する。`jstDayNumber(d)` = `Math.floor((d.getTime()+9h)/86400000)`（+9h した UTC 日＝JST 暦日）。`event.startAt - now` の日差で reminder(+1)/attendedApply(-1)/absentFollowup(-1)/unappliedFollowup(-7) を分岐。1予約は1回の実行で最大1種のみ該当（if/else if）。

- [ ] **Step 1: 失敗するテストを書く — `tests/unit/oc-reminders.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { selectDueReminders, type EventLite, type ResvLite } from "@/lib/ocReminders";

const NOW = new Date("2026-07-02T03:00:00.000Z"); // JST 2026-07-02 12:00
function ev(id: string, startAt: string): EventLite {
  return { id, title: `EV-${id}`, startAt: new Date(startAt), schoolKey: "sk" };
}
function resv(over: Partial<ResvLite> & { id: string; eventId: string; status: string }): ResvLite {
  return {
    name: "山田", email: "a@example.com", canceledAt: null, createdAt: new Date("2026-06-01T00:00:00Z"),
    reminderSentAt: null, attendedMailSentAt: null, absentMailSentAt: null, unappliedMailSentAt: null,
    ...over,
  };
}

describe("selectDueReminders", () => {
  it("翌日イベント・status=予約 → reminder", () => {
    const events = [ev("e1", "2026-07-03T01:00:00Z")]; // JST 7/3
    const rs = [resv({ id: "r1", eventId: "e1", status: "予約" })];
    const due = selectDueReminders(events, rs, [], NOW);
    expect(due.map((d) => d.kind)).toEqual(["reminder"]);
  });
  it("reminderSentAt 済みは除外", () => {
    const events = [ev("e1", "2026-07-03T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "予約", reminderSentAt: new Date() })];
    expect(selectDueReminders(events, rs, [], NOW)).toEqual([]);
  });
  it("キャンセルは全対象外", () => {
    const events = [ev("e1", "2026-07-03T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "予約", canceledAt: new Date() })];
    expect(selectDueReminders(events, rs, [], NOW)).toEqual([]);
  });
  it("前日終了・status=出席 → attendedApply", () => {
    const events = [ev("e1", "2026-07-01T01:00:00Z")]; // JST 7/1（前日）
    const rs = [resv({ id: "r1", eventId: "e1", status: "出席" })];
    expect(selectDueReminders(events, rs, [], NOW).map((d) => d.kind)).toEqual(["attendedApply"]);
  });
  it("前日終了・status=欠席 → absentFollowup", () => {
    const events = [ev("e1", "2026-07-01T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "欠席" })];
    expect(selectDueReminders(events, rs, [], NOW).map((d) => d.kind)).toEqual(["absentFollowup"]);
  });
  it("7日前終了・出席・未出願 → unappliedFollowup", () => {
    const events = [ev("e1", "2026-06-25T01:00:00Z")]; // JST 6/25（7日前）
    const rs = [resv({ id: "r1", eventId: "e1", status: "出席" })];
    expect(selectDueReminders(events, rs, [], NOW).map((d) => d.kind)).toEqual(["unappliedFollowup"]);
  });
  it("7日前終了・出席だが予約後に出願済み → 除外", () => {
    const events = [ev("e1", "2026-06-25T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "出席", createdAt: new Date("2026-06-20T00:00:00Z") })];
    const applied = [{ email: "a@example.com", createdAt: new Date("2026-06-26T00:00:00Z") }]; // 予約後
    expect(selectDueReminders(events, rs, applied, NOW)).toEqual([]);
  });
  it("出願が予約より前なら未出願扱い（除外しない）", () => {
    const events = [ev("e1", "2026-06-25T01:00:00Z")];
    const rs = [resv({ id: "r1", eventId: "e1", status: "出席", createdAt: new Date("2026-06-20T00:00:00Z") })];
    const applied = [{ email: "a@example.com", createdAt: new Date("2026-06-10T00:00:00Z") }]; // 予約前
    expect(selectDueReminders(events, rs, applied, NOW).map((d) => d.kind)).toEqual(["unappliedFollowup"]);
  });
  it("該当日でないイベントは何も出さない", () => {
    const events = [ev("e1", "2026-07-10T01:00:00Z")]; // ずっと先
    const rs = [resv({ id: "r1", eventId: "e1", status: "予約" })];
    expect(selectDueReminders(events, rs, [], NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: 実行して落ちることを確認**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/oc-reminders.test.ts`
Expected: FAIL（`@/lib/ocReminders` 未作成）。

- [ ] **Step 3: `lib/ocReminders.ts` を実装**

```ts
// OC自動メールの対象抽出（純関数）。JST の暦日差でメール種別を判定する。
export type DueKind = "reminder" | "attendedApply" | "absentFollowup" | "unappliedFollowup";

export type EventLite = { id: string; title: string; startAt: Date; schoolKey: string };
export type ResvLite = {
  id: string;
  eventId: string;
  name: string;
  email: string;
  status: string; // 予約/出席/欠席/キャンセル
  canceledAt: Date | null;
  createdAt: Date;
  reminderSentAt: Date | null;
  attendedMailSentAt: Date | null;
  absentMailSentAt: Date | null;
  unappliedMailSentAt: Date | null;
};
export type AppliedEmail = { email: string; createdAt: Date };
export type DueItem = { kind: DueKind; reservation: ResvLite; event: EventLite };

// +9h した時刻を UTC で読むと JST 壁時計。86,400,000ms で割った整数＝JST 暦日インデックス。
function jstDayNumber(d: Date): number {
  return Math.floor((d.getTime() + 9 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000));
}

export function selectDueReminders(
  events: EventLite[],
  reservations: ResvLite[],
  appliedEmails: AppliedEmail[],
  now: Date,
): DueItem[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const nowDay = jstDayNumber(now);

  const appliedByEmail = new Map<string, Date[]>();
  for (const a of appliedEmails) {
    const key = a.email.toLowerCase();
    const arr = appliedByEmail.get(key);
    if (arr) arr.push(a.createdAt);
    else appliedByEmail.set(key, [a.createdAt]);
  }

  const out: DueItem[] = [];
  for (const r of reservations) {
    if (r.canceledAt) continue;
    const event = eventById.get(r.eventId);
    if (!event) continue;
    const diff = jstDayNumber(event.startAt) - nowDay;

    if (r.status === "予約" && diff === 1 && !r.reminderSentAt) {
      out.push({ kind: "reminder", reservation: r, event });
    } else if (r.status === "出席" && diff === -1 && !r.attendedMailSentAt) {
      out.push({ kind: "attendedApply", reservation: r, event });
    } else if (r.status === "欠席" && diff === -1 && !r.absentMailSentAt) {
      out.push({ kind: "absentFollowup", reservation: r, event });
    } else if (r.status === "出席" && diff === -7 && !r.unappliedMailSentAt) {
      const applieds = appliedByEmail.get(r.email.toLowerCase()) ?? [];
      const appliedAfterReservation = applieds.some((d) => d.getTime() >= r.createdAt.getTime());
      if (!appliedAfterReservation) out.push({ kind: "unappliedFollowup", reservation: r, event });
    }
  }
  return out;
}

// kind → OCReservation の送信済みフラグ列名（cron が stamp に使う）。
export const FLAG_COLUMN: Record<DueKind, "reminderSentAt" | "attendedMailSentAt" | "absentMailSentAt" | "unappliedMailSentAt"> = {
  reminder: "reminderSentAt",
  attendedApply: "attendedMailSentAt",
  absentFollowup: "absentMailSentAt",
  unappliedFollowup: "unappliedMailSentAt",
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/oc-reminders.test.ts`
Expected: PASS（全ケース）。

- [ ] **Step 5: tsc＋commit**

```bash
cd /Users/setsuiken/senmon-fix && npx tsc --noEmit && git add lib/ocReminders.ts tests/unit/oc-reminders.test.ts && git commit -m "feat(oc): 自動メールの対象抽出selectDueReminders（純関数）＋unit"
```

---

## Task 4: 管理API `/api/admin/oc/email-templates`

**Files:**
- Create: `app/api/admin/oc/email-templates/route.ts`

> パターンは `app/api/admin/csv-columns/route.ts`（isCoreAdmin 版・SystemSetting upsert）を踏襲。`getSession`,`isCoreAdmin` from `@/lib/auth`、`withTenant`/`getTenantDb`。

- [ ] **Step 1: route.ts を実装**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession, isCoreAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { OC_EMAIL_SETTING_KEY, parseTemplates, sanitizeTemplates } from "@/lib/ocEmailTemplates";

async function guard(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  if (!isCoreAdmin(session)) return { error: NextResponse.json({ error: "権限がありません" }, { status: 403 }) };
  return { session };
}

export const GET = withTenant(async (request: NextRequest) => {
  const g = await guard(request);
  if (g.error) return g.error;
  const row = await getTenantDb().systemSetting.findFirst({ where: { key: OC_EMAIL_SETTING_KEY } });
  return NextResponse.json({ templates: parseTemplates(row?.value ?? null) });
});

export const PUT = withTenant(async (request: NextRequest) => {
  const g = await guard(request);
  if (g.error) return g.error;
  const session = g.session!;
  const body = await request.json().catch(() => ({}));
  const templates = sanitizeTemplates(body?.templates);
  const value = JSON.stringify(templates);
  await getTenantDb().systemSetting.upsert({
    where: { key: OC_EMAIL_SETTING_KEY },
    update: { value, updatedBy: session.userId },
    create: { key: OC_EMAIL_SETTING_KEY, value, updatedBy: session.userId },
  });
  return NextResponse.json({ templates });
});
```

> `session.userId` は `csv-columns`/`payment-config` と同じ。`getTenantDb().systemSetting.findFirst`/`upsert` も同パターン。

- [ ] **Step 2: tsc**

Run: `cd /Users/setsuiken/senmon-fix && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 3: commit**

```bash
cd /Users/setsuiken/senmon-fix && git add app/api/admin/oc/email-templates && git commit -m "feat(oc): 自動メールテンプレートの取得/保存API（SystemSetting・isCoreAdmin）"
```

---

## Task 5: 管理UI（OC管理ページに「自動メール」タブ）

**Files:**
- Modify: `app/admin/oc/page.tsx`

> 既存 `const [tab, setTab] = useState<"events" | "analytics">("events");`（104行付近）に `"email"` を追加。タブ切替 UI（「イベント」「分析」ボタン群）に「自動メール」を足し、開いたら GET、編集して PUT。文面編集は4テンプレの enabled トグル＋件名 input＋本文 textarea＋変数凡例＋タイミング説明。

- [ ] **Step 1: tab 型に "email" 追加**

`const [tab, setTab] = useState<"events" | "analytics">("events");` を:
```tsx
  const [tab, setTab] = useState<"events" | "analytics" | "email">("events");
```

- [ ] **Step 2: メール用 state を追加**

他の useState 群の近くに追加（`type OCEmailKey = ...` は import しても、UI ローカルに定義してもよい。ここではローカル型で完結させ、サーバlibへ依存しない）:
```tsx
  type EmailTpl = { enabled: boolean; subject: string; body: string };
  type EmailKey = "reminder" | "attendedApply" | "absentFollowup" | "unappliedFollowup";
  const [emailTpls, setEmailTpls] = useState<Record<EmailKey, EmailTpl> | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
```

- [ ] **Step 3: 取得/保存ハンドラを追加**

コンポーネント内の他ハンドラ付近に:
```tsx
  const EMAIL_META: { key: EmailKey; label: string; timing: string }[] = [
    { key: "reminder", label: "前日リマインド", timing: "イベント前日に予約者へ送信" },
    { key: "attendedApply", label: "出席御礼＋出願案内", timing: "イベント翌日に出席者へ送信（出願リンク付）" },
    { key: "absentFollowup", label: "欠席フォロー", timing: "イベント翌日に欠席者へ送信" },
    { key: "unappliedFollowup", label: "未出願フォロー", timing: "イベント7日後、出席かつ未出願の方へ送信" },
  ];

  const loadEmailTpls = async () => {
    setEmailLoading(true);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/admin/oc/email-templates");
      if (!res.ok) throw new Error("取得に失敗しました");
      const data = await res.json();
      setEmailTpls(data.templates);
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setEmailLoading(false);
    }
  };

  const saveEmailTpls = async () => {
    if (!emailTpls) return;
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/admin/oc/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: emailTpls }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      const data = await res.json();
      setEmailTpls(data.templates);
      setEmailMsg("保存しました");
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setEmailSaving(false);
    }
  };
```

- [ ] **Step 4: タブ切替に「自動メール」ボタンを追加し、選択時にロード**

既存のタブボタン群（「分析」ボタン＝346行付近を参照）に合わせて同じ `className` で「自動メール」ボタンを追加。onClick で `setTab("email")` と、未ロードなら `loadEmailTpls()`:
```tsx
          <button
            onClick={() => { setTab("email"); if (!emailTpls) loadEmailTpls(); }}
            className={tab === "email" ? /* アクティブ時の既存class */ : /* 非アクティブ時の既存class */}
          >自動メール</button>
```
（`className` は既存の「イベント」「分析」ボタンと同じ式を流用すること。ページ内の既存タブボタンを読んで一致させる。）

- [ ] **Step 5: email タブの本文を追加**

`{tab === "analytics" && ( ... )}` ブロックの後ろに、同階層で追加:
```tsx
      {tab === "email" && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            利用可能な変数: <code>{"{{name}}"}</code> <code>{"{{eventTitle}}"}</code> <code>{"{{startAt}}"}</code>{" "}
            <code>{"{{schoolName}}"}</code> <code>{"{{applyUrl}}"}</code> <code>{"{{cancelUrl}}"}</code>
            （メール送信は日次バッチで実行されます）
          </p>
          {emailMsg && <div className="text-sm text-navy-700">{emailMsg}</div>}
          {emailLoading || !emailTpls ? (
            <div className="text-gray-500">読み込み中…</div>
          ) : (
            <>
              {EMAIL_META.map((m) => {
                const t = emailTpls[m.key];
                return (
                  <div key={m.key} className="border border-gray-200 rounded-xl p-4 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-gray-900">{m.label}</h3>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={t.enabled}
                          onChange={(e) => setEmailTpls((prev) => prev && ({ ...prev, [m.key]: { ...prev[m.key], enabled: e.target.checked } }))}
                          className="accent-navy-700"
                        />
                        有効
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{m.timing}</p>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">件名</label>
                    <input
                      type="text"
                      value={t.subject}
                      onChange={(e) => setEmailTpls((prev) => prev && ({ ...prev, [m.key]: { ...prev[m.key], subject: e.target.value } }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
                    />
                    <label className="block text-xs font-semibold text-gray-500 mb-1">本文</label>
                    <textarea
                      value={t.body}
                      onChange={(e) => setEmailTpls((prev) => prev && ({ ...prev, [m.key]: { ...prev[m.key], body: e.target.value } }))}
                      rows={7}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                    />
                  </div>
                );
              })}
              <button onClick={saveEmailTpls} disabled={emailSaving} className="btn-primary">
                {emailSaving ? "保存中…" : "保存"}
              </button>
            </>
          )}
        </div>
      )}
```
（`btn-primary` / input class は既存ページの慣習に合わせる。アクティブ/非アクティブ tab の class は既存ボタンからコピー。）

- [ ] **Step 6: tsc＋build**

Run:
```bash
cd /Users/setsuiken/senmon-fix && npx tsc --noEmit
```
Expected: 0 errors。
```bash
cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" SESSION_SECRET=build-session-secret-32chars-abcdef00 CSRF_SECRET=build-csrf-secret-32chars-abcdef0000 NODE_OPTIONS=--max-old-space-size=2048 npx next build
```
Expected: ✓ Compiled successfully。

- [ ] **Step 7: commit**

```bash
cd /Users/setsuiken/senmon-fix && git add app/admin/oc/page.tsx && git commit -m "feat(oc): OC管理に自動メール編集タブ（4テンプレのenabled/件名/本文）"
```

---

## Task 6: cron スクリプト `scripts/oc-send-reminders.ts` ＋検証＋push

**Files:**
- Create: `scripts/oc-send-reminders.ts`

> 生 `PrismaClient`。イベント（startAt が now±10日）とその予約、対象 email の Application を取得 → `selectDueReminders` → 各件で該当テンプレ enabled 確認 → 変数を作り `renderTemplate` → `sendEmail`（成功=`ok:true` の時のみフラグ列 UPDATE）。`schoolName` は ApplySchool.schoolKey→name の Map で解決（無ければ schoolKey）。`--dry-run` は対象件数のみ表示。

- [ ] **Step 1: `scripts/oc-send-reminders.ts` を実装**

```ts
/**
 * OC自動メール日次バッチ（前日リマインド/出席御礼＋出願案内/欠席フォロー/未出願フォロー）。
 * 使い方（VPS crontab で日次）:
 *   DATABASE_URL=... RESEND_API_KEY=... RESEND_FROM=... NEXT_PUBLIC_BASE_URL=... \
 *   npx tsx scripts/oc-send-reminders.ts
 *   （--dry-run で送信せず対象件数のみ表示）
 * RESEND 未設定なら sendEmail が no-op を返し、フラグは立てない（後で設定後に送れる）。
 */
import { PrismaClient } from "@prisma/client";
import { selectDueReminders, FLAG_COLUMN, type EventLite, type ResvLite, type DueKind } from "@/lib/ocReminders";
import { parseTemplates, renderTemplate, OC_EMAIL_SETTING_KEY, type OCEmailKey } from "@/lib/ocEmailTemplates";
import { sendEmail } from "@/lib/email";
import { formatDateTimeJP } from "@/lib/utils";
import { ENV } from "@/lib/env";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const prisma = new PrismaClient();
  const now = new Date();
  const from = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  try {
    const events = await prisma.oCEvent.findMany({
      where: { startAt: { gte: from, lte: to } },
      select: { id: true, title: true, startAt: true, schoolKey: true },
    });
    if (events.length === 0) {
      console.log("[oc-mail] 対象期間のイベントなし。終了。");
      return;
    }
    const eventIds = events.map((e) => e.id);
    const reservations = await prisma.oCReservation.findMany({
      where: { ocEventId: { in: eventIds } },
      select: {
        id: true, ocEventId: true, name: true, email: true, status: true, canceledAt: true, createdAt: true,
        reminderSentAt: true, attendedMailSentAt: true, absentMailSentAt: true, unappliedMailSentAt: true,
      },
    });
    const emails = Array.from(new Set(reservations.map((r) => r.email)));
    const applied = emails.length
      ? await prisma.application.findMany({ where: { email: { in: emails } }, select: { email: true, createdAt: true } })
      : [];

    const eventsLite: EventLite[] = events.map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, schoolKey: e.schoolKey }));
    const resvLite: ResvLite[] = reservations.map((r) => ({ ...r, eventId: r.ocEventId }));

    const due = selectDueReminders(eventsLite, resvLite, applied, now);
    if (due.length === 0) {
      console.log("[oc-mail] 送信対象なし。終了。");
      return;
    }

    // テンプレ（SystemSetting）と学校名 Map
    const setting = await prisma.systemSetting.findFirst({ where: { key: OC_EMAIL_SETTING_KEY } });
    const templates = parseTemplates(setting?.value ?? null);
    const schools = await prisma.applySchool.findMany({ select: { schoolKey: true, name: true } });
    const schoolName = new Map(schools.map((s) => [s.schoolKey, s.name]));
    const base = ENV.PUBLIC_BASE_URL || "";

    const counts: Record<DueKind, { sent: number; skipped: number; failed: number }> = {
      reminder: { sent: 0, skipped: 0, failed: 0 },
      attendedApply: { sent: 0, skipped: 0, failed: 0 },
      absentFollowup: { sent: 0, skipped: 0, failed: 0 },
      unappliedFollowup: { sent: 0, skipped: 0, failed: 0 },
    };

    for (const item of due) {
      const key = item.kind as OCEmailKey;
      const tpl = templates[key];
      if (!tpl.enabled) { counts[item.kind].skipped++; continue; }

      const r = item.reservation;
      const e = item.event;
      const sName = schoolName.get(e.schoolKey) || e.schoolKey;
      const applyUrl = `${base}/apply?school=${encodeURIComponent(e.schoolKey)}&utm_source=oc&utm_medium=email&utm_campaign=oc_followup`;
      const cancelUrl = `${base}/oc/status?reservationNo=${encodeURIComponent("")}&email=${encodeURIComponent(r.email)}`;
      // reservationNo は select に含めていないため、cancelUrl 用に取得済みにするか、reminder のみ別途取得。
      const vars: Record<string, string> = {
        name: r.name,
        eventTitle: e.title,
        startAt: formatDateTimeJP(e.startAt),
        schoolName: sName,
        applyUrl,
        cancelUrl,
      };
      const subject = renderTemplate(tpl.subject, vars);
      const text = renderTemplate(tpl.body, vars);

      if (dryRun) { counts[item.kind].sent++; continue; }

      const result = await sendEmail({ to: r.email, subject, text });
      if (result.ok) {
        const col = FLAG_COLUMN[item.kind];
        await prisma.oCReservation.update({ where: { id: r.id }, data: { [col]: new Date() } });
        counts[item.kind].sent++;
      } else {
        counts[item.kind].failed++;
      }
    }

    console.log(`[oc-mail] ${dryRun ? "(dry-run) " : ""}完了:`, JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error("[oc-mail] 予期せぬエラー:", e); process.exit(1); });
```

> **cancelUrl の reservationNo 修正:** 上記 select に `reservationNo: true` を含める必要がある。Step 2 で修正する。

- [ ] **Step 2: reservationNo を select に追加し cancelUrl を正す**

`prisma.oCReservation.findMany` の `select` に `reservationNo: true` を追加。`ResvLite` は reservationNo を持たないので、cron 内で reservationNo を使うために **reservations（生の結果）から reservationNo を引く Map** を作る:
```ts
    const resNoById = new Map(reservations.map((r) => [r.id, r.reservationNo]));
```
そして cancelUrl を:
```ts
      const cancelUrl = `${base}/oc/status?reservationNo=${encodeURIComponent(resNoById.get(r.id) || "")}&email=${encodeURIComponent(r.email)}`;
```
（`reservations` の select に `reservationNo: true` を必ず加える。）

- [ ] **Step 3: 未設定環境で安全に動くことを確認（--dry-run）**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL=postgresql://setsuiken@localhost:5432/compass_test npx tsx scripts/oc-send-reminders.ts --dry-run`
Expected: エラーなく `[oc-mail] ... 対象期間のイベントなし。終了。` または `送信対象なし。終了。`（compass_test に該当データが無ければ）。例外・型エラーなく完了すること。

- [ ] **Step 4: tsc**

Run: `cd /Users/setsuiken/senmon-fix && npx tsc --noEmit`
Expected: 0 errors。（`ApplySchool` に `name`/`schoolKey` が無い場合はエラーになる → その場合は schema を確認し正しいフィールド名に修正。無ければ schoolName は `e.schoolKey` 固定にフォールバック。）

- [ ] **Step 5: 全 unit 非回帰**

Run: `cd /Users/setsuiken/senmon-fix && DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/oc-email-templates.test.ts tests/unit/oc-reminders.test.ts tests/unit/oc-form.test.ts tests/unit/oc-analytics.test.ts`
Expected: すべて PASS。

- [ ] **Step 6: commit＋push（fetch+rebase 必須）**

```bash
cd /Users/setsuiken/senmon-fix && git add scripts/oc-send-reminders.ts && git commit -m "feat(oc): 自動メール日次バッチ scripts/oc-send-reminders.ts（成功時のみフラグstamp）"
cd /Users/setsuiken/senmon-fix && git fetch origin && git rebase origin/chore/security-hardening
```
コンフリクト時は解消（本機能は新規ファイル中心＋schema/oc page。schema は organizationId 差分を壊さず両立）。クリーン後:
```bash
cd /Users/setsuiken/senmon-fix && git push origin chore/security-hardening
```

- [ ] **Step 7: 運用メモ（コード変更なし・報告のみ）**

VPS crontab に日次1行を追加する必要がある旨を報告（例 `0 9 * * *`、`DATABASE_URL`/`RESEND_*`/`NEXT_PUBLIC_BASE_URL` を環境に渡して `npx tsx scripts/oc-send-reminders.ts`）。実際の追加はユーザー作業。

## 受け入れ基準
- 管理画面で4種メールの enabled/件名/本文を編集・保存でき、cron バッチが対象（前日/翌日/7日後の各条件）に送信、フラグで二重送信しない。RESEND 未設定なら no-op でフラグ立たず既存フロー非破壊。SystemSetting 未設定は既定文面。
- unit（renderTemplate/parseTemplates/sanitizeTemplates/selectDueReminders）＋ build 緑。

## Self-Review
- **spec 網羅:** ①4種対象/タイミング→T3(selectDueReminders)＋T6(送信)。②テンプレ保存/render→T2。③対象抽出→T3。④送信スクリプト→T6。⑤管理UI→T4(API)+T5(UI)。⑥スキーマ→T1。テスト→各 unit。
- **プレースホルダ無し:** 全コード実体。cancelUrl の reservationNo 抜けは T6 Step2 で明示修正。
- **型一貫:** `EventLite`/`ResvLite`/`AppliedEmail`/`DueItem`/`DueKind`/`FLAG_COLUMN`（T3）を T6 が使用。`OCEmailKey`/`parseTemplates`/`renderTemplate`/`sanitizeTemplates`/`OC_EMAIL_SETTING_KEY`（T2）を T4/T6 が使用。`ResvLite` は `eventId`（cron で `ocEventId`→`eventId` に写像）。
- **後方互換:** 追加式マイグレーション／SystemSetting 未設定既定／sendEmail no-op でフラグ立てず。
- **注意点:** `prisma migrate dev` 禁止（手書き migration）。`ApplySchool` のフィールド名要確認（name/schoolKey）。build の SESSION_SECRET は min32。stamp は `result.ok` 時のみ。1予約1実行で最大1種（if/else if）。
