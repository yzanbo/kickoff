# チャット（`features/chat`）

保存される会話（`Chat`・表 `chats`）と記録（`ChatEvent`・表 `chat_events`）、1 回の実行、画面の店と操作。コアの実行は `core/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `CHT-`・`RUN-`。

## 地図
- `@shared/chat/`: 取り決め `contract.ts`・記録 `chatEvent.ts`・状態 `state.ts`・索引 `chatIndex.ts`・出す箱 `outbox.ts`・書きかけ `streamingRules.ts`・定型文 `prompts.ts`・受け渡し `handoff.ts`
- `core/`: 実行（`run/`）・受け口（`routes/`）・家系 `family.ts`・記録の読み方 `chatLogQuery.ts`・巻き戻し `rewind.ts`・AI のツール `tools/`
- `ui/store/`: 店・知っているチャット `knownChats.ts`・回答待ち `approvals.ts`・取り出し口 `defineChatSelector`
- `ui/chatActions.ts`（アーカイブ・削除・移動）・`useChatRename.ts`・`closeChat.ts`・`places.ts`（右の欄・パネルの住所）

## 決まり
- 記録は `type` で中身が決まる判別共用体。`e.type` で絞り、`data as …` と書かない（`ChatEventOf<T>`・外すのは `DistributiveOmit`）。AI が出す記録は `@shared/ai/turnEvents.ts`、コアが作る記録は `chatEvent.ts` に足す。
- 状態は `agentStateOf`・カンバンの列は `boardColumnOf`（AI の状態だけで決まる）。画面は `chatStateOf`、文と色は `stateLooks`。場所ごとに判定を書かない。回答待ちはチャットの状態に持たない。
- AI へ送る定型文と子から親への受け渡しの文は `prompts.ts`・`handoff.ts` に足して使う（手で組み立てない）。
- システムプロンプトのプロジェクトの節（`core/prompt/system.ts`）は、共通（`isUserProject` でないもの）では作業フォルダを伝え、共通のチャット（ノートのチャットでないもの）には概要と利用者のプロジェクトの名前（アーカイブしていないもの）も伝える。共通にはワークツリーのチャットを作らない（`routes/chats.ts` の 409）。
- AI のツールでほかのプロジェクトを指せるのは共通のチャットだけ（`core/tools/projectScope.ts`。`move_workplace` の行き先は除く）。読むのは聞かず、書く（`create_chat`・`update_chat`・`write_project_note`・`move_note`・自分を移す）のは効く設定 1 つ（`@shared/chat/aiWritePolicy`）に従って `core/tools/aiWriteApproval.ts` で聞く。
- 既読は、画面が一番下まで見た記録の ID を渡し、自分で見たときだけ付ける。それより新しい結果があれば消さない。印の付け外しで並び順を変えない。
- アーカイブ・削除は `chatActions.ts` を通し、どこからでも確かめる（取り消しの通知で代えない）。名前は `useChatRename`＋`ChatTitleInput`（上限 `CHAT_TITLE_MAX`）。
- ✕ は `closeChatWithChoice`（既定は `chat:close-action`）、Esc・タブの「閉じる」は聞かずに閉じる。

## 落とし穴
- 未読の条件 `isUnreadEvent` は、コアの `store.events.latestUnreadId` が SQL で同じものを持つ（変えたら両方）。
- 画面は記録の末尾と索引を読む。記録全体から作る関数には索引＋末尾を `mergeById` で重ねて渡す。選ぶ規則は `selectIndexIds` 1 か所（コアの `buildIndex` も通す。SQL に書き直さない）。規則を変えた・関数を足したら `chatIndex.test.ts` の「どの切れ目でも全件と同じ」（図は `@shared/visuals/aiVisual.test.ts`）を通す。
- 書きかけの足し・消し（`streamingEffectOf`）・送信待ちの止める印（`queueStops.ts`）は、コア・画面・スマホが同じ関数（変えたら 3 つに効く）。
- 削除したチャットの書きかけは composer が `chat_deleted` で消す。
- テスト: `core/routes.*.test.ts`・`core/run/machine/*.test.ts`・`core/run/scenarios.runner.test.ts`・`@shared/chat/*.test.ts`。
