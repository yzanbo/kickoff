# ゴミ箱（`src/features/trash`）

Kickoff のゴミ箱（消したものを 3 日取っておき、元に戻せる。OS のゴミ箱とは別）。

## 地図

| ファイル | 中身 |
|---|---|
| `core/service.ts` | `TrashService`（入れる `putPath` / `addRecord`・種類ごとの戻す・消す `registerKind(def)`・本当に消す `purge`）。覚え書きは表 `trash_items`（`details` は種類ごとの形 `TrashDetailsByKind`） |
| `core/command.ts` | AI の kickoff-trash（自分で置き場に書き、`importInbox` が取り込む） |
| `ui/stores/trash.ts`・`ui/api/trash.ts` | 一覧の店（プロジェクトごと・ゴミ箱のプロジェクト・どこにも出ないもの）・API |
| `ui/TrashTab.tsx`・`ui/TrashSettings.tsx` | プロジェクトの「ゴミ箱」タブ・設定の「ゴミ箱と整理」（使っていない会話記録は `@/features/chat/ui/trash/OrphanSessions.tsx`） |
| `ui/TrashMarkRows.tsx` | コマンドの出力の下の［元に戻す］（印の読み方は `@shared/trash/marks`） |
| `ui/trashActions.ts`・`ui/trashText.ts` | 戻す・完全に消す・消した直後の知らせ `showTrashedToast`・残り時間と確認の文 |

種類を登録するのは `@/features/chat/core/sessions/`（`chatTrashKinds`・`projectTrashKind`。プロジェクトの中のチャットごと戻す・消すので chat。消したチャットの名前は `useChats`）・`@/features/worktrees/core/trash.ts`。取り決めは `@shared/trash/contract.ts`（整理・持ち主のない会話記録の口は chat が受ける）。

AI の kickoff-trash で入れたものの元の場所の引き当て（`addOriginResolver`）は projects（本体）とノート（ノートのフォルダ）が、取り込んだあと（`addImportHook`）はノートが登録する（`core/index.ts` の `createTrash`）。

## 決まり

- 入れた時刻は片付けと同じサービスの時計で付ける。本当に消すのは `sweep` も `purgeNow` も同じ `purge` を通す。
- チャット・プロジェクトは行を残して読み取りから外すだけ。本当に消すとき（`purgeChatsOf`）は、行を消す前に会話記録と添付の候補を集め、消したあとで使われていないものだけを消す。
- 同じフォルダのプロジェクトがゴミ箱にあるうちは、作る・取り込む・フォルダの変更を 409。口は端末に開かない。
- 消す操作をした領域は `showTrashedToast` で知らせる（ファイル・ノート・チャット・プロジェクト）。
- 戻すとき、元の場所に同じ名前があれば上書きしない（別の名前で戻すかを聞く）。
- 完全に消す操作は必ず確認のダイアログを出す（取り消せない）。まとめて消すのは、確かめたときに並んでいた ID だけ。

## 落とし穴

- 片付けの途中に頼まれたら、終わってからもう一度流す。
- AI の kickoff-trash は画面を通らずに入れ、コアが一覧を読むときに取り込む（守りは `src/features/guard/CLAUDE.md`）。店は SSE `trash` と窓に戻ったときに取り直す。
- 会話記録を片付ける前に、ほかの Kickoff の DB も使っていないか確かめる（`siblingSessions.ts`。製品版と開発版は同じ `~/.claude/projects`）。使っていない会話記録はターミナルで使った Claude Code の分も出るので、自動では消さない・入れない（選んで確かめてから）。
- 会話の中の行は、呼び出しを開いたときに 1 回だけゴミ箱にあるかを聞く（閉じたままでは聞かない）。
- テストは `core/routes/server.trash.test.ts`（`trashBin`・`trashClock`）。
