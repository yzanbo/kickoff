# 守り（書き込み・見せない DB・自分を守る・砂場）（`src/features/guard`）

## AI への指示と許可（`@/features/chat/core/prompt/system.ts`・`core/allowedCommands.ts`）

- 承認なしのコマンド `ALLOWED_COMMANDS` はどのチャットも同じで、門の `allowedCommands` から各 AI が自分の権限設定に変える。ファイルの編集を自動で承認するかは権限モードだけで決まる。
- `buildSystemPrompt` はどの AI にも同じものを渡す。送るたびに設定を読む。会話ごと別のフォルダへ移るツールは `KICKOFF_DISALLOWED_TOOLS` で外す。

## 書き込みの守り（`core/guard/`・`core/sandbox/`）

| ファイル | 守るもの | 当て方 |
|---|---|---|
| `scope.ts` | 参照資料・`untrackedOnly` のチャットの Git の中身 | 断る |
| `writeScope.ts` | ファイルのツールの書く先（ほかの作業場所は断る） | 聞く |
| `hiddenDb.ts`（`@/features/database/core/guard/`） | 見せない DB への直接の接続 | 断る |
| `dockerCommand.ts`・`dockerGuard.ts`（`@/features/docker/core/guard/`） | ほかの作業場所・プロジェクトのコンテナとボリューム | 聞く |
| `deleteGuard.ts`・`gitHookGuard.ts`・`compileCacheGuard.ts` | 消すコマンド・フックを飛ばす・`NODE_COMPILE_CACHE` | 断る |
| `selfProtection.ts` | 自分を動かしている Kickoff | 断る |
| `core/sandbox/` | Bash が書ける場所 | OS が止める |

- 判定の形は `core/rules.ts` の `GuardVerdict` 1 つ（断るだけの守りは `DenyVerdict`）。ツールのパスの欄は `@shared/ai/claudeTools` の表から読み、`scope.ts` の `resolveCallPaths`（作業フォルダで解く・`~` を開く）でそろえてから守りに渡す（守りは自分で解かない）。
- 判定はプロバイダーに依らない純粋関数。Claude は PreToolUse のフック（`turnHooks`）で毎回呼び、権限モード・許可ルールに関係なく効く。
- 守りは `GuardRule`（名前は `GUARD_ORDER`）を返す関数で作り、当てるのは `judge.ts` の `judgeCall` 1 つ（断る守りを全部見てから聞く守り）。実行ごとの門 `gate.ts`（`ToolGate`）が材料から決まりを並べ、承認を聞いてくる CLI はこれに当てる。Claude のフック（`policy.ts`）はまだ自分で並べるので、守りを足したら両方に入れる。
- 守りの理由と見抜けない書き方は各ファイルの頭に書く（うっかりを防ぐもので、わざと避ける書き方までは見抜けない）。
- Bash の文の区切りと `sh -c` の中へ下りるのは `@/foundation/core/shell/shellWords.ts`（`scanCommands`）1 つを共有する。直したら、それを使う守りのテストを全部通す。
- 聞く守りは Auto mode でも聞く。「このチャットでは許可」は `ChatRuntime.writeAllowed` に覚える（保存しない）。
- 砂場（`bashSandboxFor`）はどのチャットにもかけ、内蔵ターミナルにはかけない。利用者の設定ファイルは書ける場所に入れない（理由は JSDoc）。
- 砂場の外で流すコマンドは、コマンド全体がそれだけのときだけ外で流れる（VAR=値・パイプ・リダイレクトが付くと中に戻る）。
- ネットワークは絞らず `networkRelay.ts` の中継を使わせる（`@/app/core/prepare.ts` が起こし、`createGuard` の `stop` で止める）。
- `writeScope` は参照資料・Kickoff の保存先・見せない DB に口を出さず、そちらの守りに任せる（カードを出さない）。
- `deleteGuard` は `ExecutionDeps.trashCommand` があるときだけ付け、`trashCommandEnv` で PATH に kickoff-trash を入れる。
- 砂場の拒否の診断（`core/chatDiagnosticTools.ts`）は生の本文・パス・コマンドラインとほかのチャットのログを返さない。砂場の設定は変えない。
