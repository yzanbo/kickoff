# 守り（`features/guard`）

AI のツールの呼び出しを、書き込み・見せない DB・自分（Kickoff）・砂場の決まりに当てる門。受け入れの一覧: `docs/features.md` の `RUN-`。

## 地図
- `core/rules.ts`: 判定 `GuardVerdict`（断るだけは `DenyVerdict`）・`GuardRule`・当てる順 `GUARD_ORDER`
- `core/judge.ts`（`judgeCall`）・`core/gate.ts`（実行ごとの門 `ToolGate`。上の機能は `addRuleSource`）・`core/turnParts.ts`（門・砂場・診断の contributor）
- `core/guard/`: `scope.ts`（参照資料・`untrackedOnly`・`resolveCallPaths`）・`writeScope.ts`（書く先。聞く）・`deleteGuard.ts`・`gitHookGuard.ts`・`compileCacheGuard.ts`・`selfProtection.ts`（断る）
- 上の機能の守り: `@/features/database/core/guard/hiddenDb.ts`（断る）・`@/features/docker/core/guard/`（聞く）
- `core/sandbox/`（Bash が書ける場所。OS が止める）・`networkRelay.ts`・`core/allowedCommands.ts`（`ALLOWED_COMMANDS`）

## 決まり
- 守りの判定は 1 つ: どの AI も `judgeCall` に当て、断る守りを全部見てから聞く守り。判定はプロバイダーに依らない純粋関数。
- Claude は PreToolUse のフック 1 つで毎回門に当てる。自分を守る判定は権限モード・許可ルールに関係なく効く。聞く守りは Auto mode でも聞く。
- パスは `resolveCallPaths` で作業フォルダで解いてから守りに渡す（相対パスを cwd で解かない・守りは自分で解かない）。パスの欄は `@shared/ai/claudeTools` の表から読む。
- 承認なしのコマンドはどのチャットも同じ。ファイルの編集を自動で承認するかは権限モードだけで決まる。
- 「このチャットでは許可」は contributor がチャットごとに持つ（保存しない）。`writeScope` は参照資料・保存先・見せない DB に口を出さない。
- 共通のチャットは編集先の制限と砂場をいつも入にし（`chatRestrictions`）、利用者のプロジェクトの本体と読むだけのフォルダ（ほかのノートのフォルダなど）への Write・Edit を聞かずに断る（`denied`）。判定は「チャット自身の場所 → 断るフォルダ → 一時フォルダなど決まりの例外」の順で、一時フォルダの中のプロジェクトも断る。砂場でも書かせない側に入れる。
- 砂場はどのチャットにもかけ、内蔵ターミナルにはかけない。利用者の設定ファイルは書ける場所に入れない。ネットワークは絞らず中継を使わせる。
- 砂場の拒否の診断は生の本文・パス・コマンドラインとほかのチャットのログを返さず、設定を変えない。

## 落とし穴
- 守りはうっかりを防ぐもので、わざと避ける書き方は見抜けない（理由と見抜けない書き方は各ファイルの頭）。
- Bash の文の区切りと `sh -c` の中へ下りるのは `@/foundation/core/shell/shellWords.ts` の `scanCommands` 1 つ。直したら使う守りのテストを全部通す。
- 砂場の外で流すコマンドは、全体がそれだけのときだけ外で流れる（VAR=値・パイプ・リダイレクトで中に戻る）。
- 砂場の規則は後に書いた書かせない側が勝ち、その中を書ける側に戻せない。書ける場所を中に持つプロジェクトは砂場の書かせない側に入れない。Codex の砂場は書けるフォルダの中を書かせない口がないので、書かせない側が一時フォルダの中にあれば一時フォルダごと外す（`commandTempDir`）。
- `deleteGuard` は kickoff-trash を置いたときだけ付ける。門と砂場はほかの contributor のフォルダを読んでから作る。
- テスト: `core/**/*.test.ts`・`src/app/core/net/guardVerdicts.test.ts`・`guardApprovals.test.ts`（記録）。
