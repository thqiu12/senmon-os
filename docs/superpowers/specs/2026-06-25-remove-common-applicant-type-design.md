# 「共通」出願者タイプの撤去 設計書（A案：完全タイプ別）

**日付:** 2026-06-25 / **対象:** senmon/Compass 出願システム / **ブランチ:** `chore/security-hardening`（本番・Postgres）

## 目的
フォーム項目設定の「共通（applicantType=null）」スコープを撤去し、すべて **日本人学生 / 留学生** の2タイプで独立に設定する。これにより「どっちを編集すれば反映されるか分からない」「共通と型でぶつかる」混乱と、保存時の全項目実体化（共通編集が型に伝わらなくなる罠）を解消する。コードレベルの**タイプ別既定**（`defaultEnabledFor`：日本人は在日情報を既定オフ等）は**baseline として維持**する。

## 確定した設計判断
- 既存の共通（applicantType=null）行は **各タイプ（japanese / foreign）にコピーしてから共通を削除**（全校共通撤去と同じ「コピー→撤去」方針。現在の挙動を保ったまま、以後タイプ別に分岐可能に）。
- コード既定（FORM_FIELD_DEFAULTS + defaultEnabledFor）は残す＝新規・未設定はタイプ別既定から開始（日本人の在日情報オフ等は自動維持）。
- 管理画面の「共通」タブを撤去し、学校選択後は **日本人学生 / 留学生** のどちらかを必ず選ぶ（既定＝留学生）。

> スコープ次元の「全校共通(schoolId=null)」は既に撤去済み。本件は applicantType=null の撤去。両者は独立。

---

## データモデル / マージ
- `FormFieldConfig` の行スコープは `(schoolId=schoolKey, applicantType ∈ {japanese, foreign})` のみになる（applicantType=null は移行で消す）。
- `mergeFormConfig`（`lib/applyFormConfigMerge.ts`）から **共通(applicantType=null)段を撤去**：
  - 現状の `tierOf` は schoolId=null を無視済み。これに加えて **applicantType=null の行も無視**する。残るは「学校×該当type」行のみ。
  - 優先順位：`既定(type別, defaultEnabledFor) < 学校×type`。
  - isEnabled 最終判定：`該当type行があればその値 / 無ければ defaultEnabledFor(key,type)`（共通行ベースの commonEnabled ロジックは不要に＝簡素化）。在日情報のタイプ既定オフ保護は `defaultEnabledFor` で維持。

## ルート
- `app/api/apply/form-config/route.ts`：
  - typed 経路：`where applicantType: type`（`{OR:[{null},{type}]}` から null を外す）。実質、その type の行のみ + 既定。
  - レガシー（type 無し）経路：出願フォームは必ず type を持つ。type 無しは既定（fallback）を返す（共通行は読まない）。
- `app/api/admin/form-config/route.ts`：
  - 共通スコープ（applicantType 未指定 = null）の GET 分岐を撤去し、**applicantType 必須**（japanese/foreign のみ）に。type が無ければ既定の合成を返す（編集対象にはしない）。
  - 自動生成（不足デフォルト挿入）は型別スコープで合成読みするだけ（DB に共通行を作らない）。
  - PUT/POST：applicantType は japanese/foreign のみ受ける（null を作らない）。

## 管理UI（`app/admin/form-config/page.tsx`）
- 出願者タイプ選択から「共通」を撤去。`日本人学生 / 留学生` の2つだけ。`selectedApplicantType` の初期値を `foreign`（留学生）にし、null（共通）状態を無くす。
- 既存の examMode カード・カスタム項目・重複警告はそのまま（type スコープで動く）。

## 移行（`scripts/migrate-remove-common-type.ts`・冪等）
1. 全 ApplySchool の schoolKey を取得。
2. 各校の `applicantType=null` 行を取得。各 null 行を、その校の `japanese` と `foreign` に **(fieldKey, schoolId, type) が無ければコピー**（createMany skipDuplicates 相当・新 id・updatedAt=now）。既存の型別行は上書きしない。
3. コピー完了後、各校の `applicantType=null` 行を**全削除**。
4. 件数ログ。再実行は null 行が無い→no-op（冪等）。
- 実行：auto-deploy に冪等フック追加（ビルド前）＋本番は手動1回（自己更新1デプロイ遅れ対策、全校共通撤去と同じ運用）。

## 後方互換
- 既存 `Application`（examMode 等）は無改修。出願フローも不変（type ゲートは既存）。
- 移行で各タイプが現在の共通設定を継承＝**出願フォームの見た目は移行前と一致**（その後タイプ別に分岐可能）。
- タイプ別既定（在日情報オフ等）は `defaultEnabledFor` で維持。

## テスト / 検証
- ユニット：mergeFormConfig が applicantType=null を無視し「既定(type) < 学校type」になること（既存テスト書換）。移行純関数（null→両タイプ コピー対象算出）。
- build 78/78、e2e（student-apply UI + api）非回帰。
- 実機（compass_e2e）：共通行に識別可能な設定を仕込み→移行→各タイプに継承・共通0・apply 反映・冪等 を確認。

## 受け入れ基準
- 管理画面に「共通」タイプが無く、日本人/留学生で独立設定。型既定（在日情報オフ等）は維持。
- 既存の共通設定が各タイプにコピーされ、移行直後の出願フォームは従来どおり。以後タイプ別に編集可能。
- applicantType=null 行が消える。全 unit/build/e2e グリーン。移行は冪等。

## スコープ外
- 「日本語学校項目を日本人で非表示」等の個別整理は移行後に各タイプで行う（本件は土台のみ）。
- 継承バッジ等の B案 UX は作らない（A案＝フラット化のため不要）。

## 影響ファイル
- `lib/applyFormConfigMerge.ts`（共通段撤去）
- `app/api/apply/form-config/route.ts` / `app/api/admin/form-config/route.ts`（null 読み書き撤去・type必須）
- `app/admin/form-config/page.tsx`（共通タブ撤去・既定 foreign）
- `lib/migrateRemoveCommonType.ts`（純関数）+ `scripts/migrate-remove-common-type.ts`（移行）+ `scripts/deploy/auto-deploy.sh`（フック）
- テスト各種
