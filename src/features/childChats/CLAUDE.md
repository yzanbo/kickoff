# 子チャット（`src/features/childChats`）

## 地図

- `core/`: ルート `routes.ts`・作る `children.ts`（`startChildChat`）・分岐 `fork.ts`・親から外す `detach.ts`（AI の update_chat には chat の `ChatDetachPort` で渡す）・サブエージェントについて聞く `subagentChild.ts`・親に渡す `handBack.ts`・親子の文脈 `context.ts`（`chatContextNote`）・AI のツール `create_chat` の `aiCreateChat.ts`（組と家系の文脈の contributor は `tools.ts`。AI のツールの決まりは `src/features/chat/CLAUDE.md` の「AI の操作ツールの中身」）。
- `ui/`: 上の帯は `ChildBarFrame` 1 つ・タブの印 `ChildActivityMark`・親から外す `detachChild.ts`・親に渡す `handBack.ts`。右の欄の子チャット `SideChildChat` は `@/features/conversation/ui/screens/`。

## 決まり

- 子チャットは `parent_chat_id`・`parent_event_id` を持つふつうのチャット。親が作業中でも作れる。選択は親から引き継がず設定どおり（`resolveChatOptions`）。
- 引き継ぐときは、親の最後まで終わった作業からプロバイダーの `fork` で写す。写すのは作ってから（`inheritThenExecute`）で、その間は準備（`preparing_for: inherit`）で作業中に数え「いま」は預かる。
- 写せない・起点がない・親と違う AI なら、お知らせを残して引き継がずに動かす。写すのは直近の区切りだけ（`CHILD_FORK_KEEP`）。
- 親子の文脈は送るたびに指示に添える（システムプロンプトにしない理由は JSDoc）。
- 移動・削除・アーカイブは子孫ごと（どれかが作業中なら 409）。アーカイブは `store.chats.archive` だけで変え、戻すのは `archived_with_parent` の印のあるものだけ。確かめの文は `chatActions.ts` の `childNote`、数は `knownDescendantCount`。
- 分岐は最後まで終わった作業からだけで、ファイルは戻さない。親から外すは親なしか先祖の子にだけ上げる（画面は確かめてから `childChatsApi`（`ui/api.ts` の `client(childChatContract)`）。作業中は外さない）。外したら右の欄のタブを閉じる（`reopenDetached`）。
- サブエージェントについて聞くは記録を添付にし、会話は引き継がない（理由は JSDoc）。
- 親に渡すのはその作業の最後の返答（`lastReplyOfTurn`）だけ。親の発言に `handoff_from`、子に `handoff` を残す。渡したあとの削除は、今すぐ送った・送信待ちに入れたときだけ（`handoffAfterFor`。入力欄に入れたときはアーカイブ）。
- 一覧（`selectChats`）に出さず、親の中だけに置く（`@/features/chat/ui/store/knownChats.ts` の `childChatsOf`）。引用は入力欄の文に入れて送る（API の `quote` は送らない）。

## 落とし穴

- 作った子チャットは、知らせを待たずに `addChat` で一覧に入れてから開く（入っていないと親をたどれず、ふつうのタブで開く）。開き方は `openCreatedChild`・`openChat`・`openAskChild`（`askChild.ts`）。別ウィンドウからはメインのウィンドウに頼む。
- 右の欄の子チャットには右の欄を重ねない（`PanelHostContext` を null）。親の画面が見えていなければ先に開く（`openInRootSide`）。
- 親の札の 1 回押しは `REVEAL_DELAY_MS` 待つ（ダブルクリックの名前の変更と分ける）。新しくできた子の明滅（`freshChildren`）は、会話の欄を隠している間は光らせない。
- 親への依頼文の頼み方は `@shared/chat/handoff`。利用者が頼み直しても同じ形になるよう `core/context.ts` にも 1 行ある（変えたら両方）。
- タブの印は `role="button"` の span にし、一覧は body に出して、中のクリック・キーをタブに届かせない（Esc は止めない）。
