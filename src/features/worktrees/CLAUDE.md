# ワークツリー（`src/features/worktrees`）

チャットごとの作業場所（`chats.worktree_path`。`null` なら本体）のうち、ワークツリーを作る・片付ける・実行環境。作業場所の型・一覧の店・選ぶ部品・色は `@/foundation/ui/workplace/`（コアは `@/foundation/core/workplace/`）、ファイル・変更の画面は `src/features/files/CLAUDE.md`。

## 地図

- `core/routes/worktrees.ts`: 一覧を返す API（`present` で実行環境と色 `core/colors.ts` を付ける）。
- `core/finish.ts`・`core/backup.ts`: 消す `WorktreeFinisher`（消した・戻したあとは `afterChange`、消したあとは `afterRemove` に上の機能が登録したものを呼ぶ。github が PR の知らせを作り直し、database が DB の接続を片付ける）・失うものの Git の控え。`core/headWatch.ts`: Git のフォルダを見張って `worktrees_changed` を出す。
- `core/env/`: 実行環境 `WorktreeEnvService`（ポートの帯 `bands.ts`・`.env` の区切り `envRewrite.ts`）。
- `core/aiWorktree.ts`: AI のツール `finish_worktree`（AI のツールの決まりは `src/features/chat/CLAUDE.md` の「AI の操作ツールの中身」）。
- `ui/`: PR・片付ける・消す（`WorktreeBar`・`removeWorktree.ts`）。

## 決まり

- 置き場所は一番上の隣の `<名前>-worktrees/<ブランチ>`。`GitWorktree` の `root` は一番上、`path` は作業するフォルダ（チャットの `worktree_path`・`?worktree=` はこちら。一番上へ戻すのはコアの中だけ。名前を出すときは `root`）。
- 作ったら `prepareWorktree` が無視しているもの（`node_modules` など）を APFS の複製で写し、`onCreated` で実行環境を整える。作る道（API・新しいチャット・PR・CI）はどれも同じ口を渡す。
- 消すのは画面も AI も `WorktreeFinisher`（画面は `confirmRemoveWorktree` で失うコミットを先に知らせる）。失うものは控えに入れてゴミ箱に残し、チャットは `Runner.moveWorkplace` で本体へ移す（同じリポジトリのほかのプロジェクトも見る = `usersOf`）。
- 「コンテナとデータも消す」は本体と同じ組の名前のワークツリーでは出さない（本体のデータが消える）。
- 実行環境はワークツリーごとにポートの帯と Docker の組の名前を分ける。決めるのは作るときだけで、書くのは Git で管理していないファイルだけ。Git で管理している `.env` があれば何も書かずに `blocked`。
- 色はコアが付けた `GitWorktree.hue`。一覧は店 `@/foundation/ui/workplace/worktreesStore.ts` の 1 系統だけ（操作の応答の一覧は `worktreesStore.set` で入れる）。

## 落とし穴

- 片付けを予約したワークツリーは移す先にできない（`reservedFolders`）。Git でないフォルダの一覧は空で返す（失敗にすると画面が取り直し続ける）。
- `prepare` の順は `.env` を写す → 帯を選ぶ → compose に聞いて番号を並べる → `.env` の Kickoff の区切りと上書きファイル → 接続先の書き換え。途中で失敗してもワークツリーの作成は失敗させない。チャットの AI と内蔵ターミナルには `PORT` を渡す（`envFor`）。
- ［AI で整える］は `untrackedOnly` のチャットで始める（`src/features/guard/CLAUDE.md`）。
- 作業場所を移したら右の欄のタブを付け替える（`workplace_moved` の知らせで。自動で移ったときも）。
- 開発版の Kickoff は保存先とポートが 1 つなので、同時に起動できるのは 1 つのワークツリーだけ。
- テストは `core/routes/server.worktreeEnv.test.ts`・`@/features/guard/core/guard/scope.test.ts`。
