/**
 * API テスト: トップページの「次回 受付開始予定」表示の土台。
 *
 * /api/apply/cohorts?includeUpcoming=1 は「受付中(active)」に加え、受付開始が未来の
 * 「次回(upcoming)」回次も upcoming:true 付きで返す。
 * 既定(パラメータ無し)は従来どおり active のみ
 *   ← apply フォーム側はこれで受付可否を判定しているため、壊してはいけない。
 */
import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

async function adminCsrf(request: APIRequestContext): Promise<string | null> {
  const res = await request.post("/api/admin/login", {
    data: { username: "admin", password: "TestAdmin2026!" },
  });
  if (!res.ok()) return null;
  return (await res.json()).csrfToken as string;
}

test.describe("/api/apply/cohorts 次回(upcoming)回次", () => {
  test("includeUpcoming=1 は未来開始の回次を upcoming:true で返し、既定では返さない", async ({ request }) => {
    const csrf = await adminCsrf(request);
    if (!csrf) test.skip(true, "admin seed が無い");
    const H = { "X-CSRF-Token": csrf! };

    const schoolKey = `test-upcoming-${Date.now()}`;
    const create = await request.post("/api/cohorts", {
      headers: H,
      data: {
        name: "次回テスト回",
        status: "受付中",
        round: 9,
        schoolKey,
        acceptStart: "2099-01-01T00:00:00.000Z", // 未来＝まだ受付開始していない
        acceptEnd: "2099-02-01T00:00:00.000Z",
        examDate: "2099年2月10日",
      },
    });
    expect(create.ok(), `作成失敗: ${create.status()} ${await create.text()}`).toBeTruthy();

    // includeUpcoming=1: 未来開始の回次が upcoming:true で含まれる
    const withUpcoming = await request.get("/api/apply/cohorts?includeUpcoming=1");
    expect(withUpcoming.ok()).toBeTruthy();
    const list: Array<{ schoolKey: string | null; upcoming?: boolean }> = await withUpcoming.json();
    const found = list.find((c) => c.schoolKey === schoolKey);
    expect(found, "次回回次が includeUpcoming=1 に含まれない").toBeTruthy();
    expect(found!.upcoming).toBe(true);

    // 既定（パラメータ無し）: 未来開始の回次は返らない（apply フォーム側の非回帰）
    const def = await request.get("/api/apply/cohorts");
    const defList: Array<{ schoolKey: string | null }> = await def.json();
    expect(defList.find((c) => c.schoolKey === schoolKey)).toBeFalsy();
  });
});
