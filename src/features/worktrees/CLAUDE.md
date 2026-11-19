# 作業場所と並行開発（`features/worktree`）
<!-- 行き先: src/features/worktrees/ -->

チャットごとの作業場所（`chats.worktree_path`。`null` なら本体）。ファイル・変更の画面は `features/editor/CLAUDE.md`。

| ファイル | 中身 |
|---|---|
| `workplace.ts`・`workplaceHue.ts` | 作業場所とブランチの出し方 `workplaceOf`・色 |
| `WorktreeChip`・`WorkplacePicker`・`WorktreePicker` | 札・新しいチャットの作業場所・タブで見る作業場所 |
| `WorktreeBar`・`removeWorktree.ts` | PR・片付ける・消す |
| `busyWorkplace.ts`・`prNotice/` | 作業中のチャットのある所に送る・PR の知らせ |
| `moveWorkplace.ts`・`repointTabs.ts` | 作業場所を移す・タブの付け替え |

- 一覧は店 `stores/worktrees.ts` の 1 系統だけ（部品ごとに読まない）。操作の応答の一覧は `worktreesStore.set` で入れる。
- 色・種類・まとまりは作業場所、ブランチ名はいまのブランチで出す（`workplaceOf`）。色はコアが付けた `GitWorktree.hue`。
- `GitWorktree.path` は作業するフォルダ（`?worktree=`・パス）、名前を出すときは `root`（`worktreeLabel`）。
- 消すのは `confirmRemoveWorktree` を通す（失うコミットを先に知らせる）。
- 「コンテナとデータも消す」は本体と同じ組の名前のワークツリーでは出さない（本体のデータが消える）。
- PR の知らせの確認 `PrNoticeHost` はメインのウィンドウにだけ置く。チャットは子孫ごと扱う（`rootChatIds`）。
- 作業場所を移したら右の欄のタブを付け替える（`workplace_moved` の知らせで。自動で移ったときも）。
- 開発版の Kickoff は保存先とポートが 1 つなので、同時に起動できるのは 1 つのワークツリーだけ。
