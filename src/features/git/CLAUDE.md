# Git（`src/features/git`）

## 地図

- `core/index.ts` が入口（状態 `status.ts`・差分とコミット `changes.ts`・`blame.ts`・`history.ts`・ブランチの操作 `branches.ts`）。ファイルと検索・置換は `@/features/files/core/`、プロジェクトの作成と取り込みは `@/features/projects/core/workspace.ts`。
- `core/tools.ts`: AI の `open_diff`（パスは files の `workPathIn`）。
- `ui/`: 変更・差分・コミット（`ChangesPane`・`DiffView`）と、履歴（`ui/history/`。操作の窓 `GitCommandPalette`・途中の操作の帯 `OperationBanner`）。

## 決まり

- ファイルの操作は土台の `folderFiles`（リポジトリの外を断る。保存は開いたときの指紋と比べ、ほかで変わっていれば 409）。消すのは Kickoff のゴミ箱へ。
- ブランチ・タグの名前は「-」で始まるものを断る。マージ・リベース・プルは衝突で止まっても失敗にせず、衝突したファイルを返す。
- Git で管理していないプロジェクト（`repo: false`）のファイルの一覧と検索は `@/foundation/core/workplace/plainFolder.ts`（フォルダの中に何も作らない）。ワークツリー・差分・履歴は 400。
- リポジトリの中のフォルダを本体にしたプロジェクト（`gitPrefix`）は、そのフォルダから見たパスで返す。コミットは、外にもステージしたファイルがあれば 409。
- 取り込みとフォルダの変更は `prepareImportedWorkspace` の決まり。登録済みかは実体のパスでも比べる（`projectAt`）。フォルダを変えたら、チャットは `workplaceMove.api.move` で移す（`src/features/workplaceMove/CLAUDE.md`）。
- プロジェクトの GitHub のアカウントは `runAsGitHubAccount` の中で gh に渡す（github が `k.workplace.projectScopes` に登録し、プロジェクトの引き当てが包むので、ルートで渡さない。gh の有効なアカウントは切り替えない）。git は remote に触る操作（`k.workplace.git`。github が `gitEnv` に登録）だけにトークンを足す。
- GitHub として扱うホストは `@/features/github/core/githubTarget.ts` の `GITHUB_HOSTS` だけ（Enterprise を足すときに直す所はその JSDoc）。
- リモートとやり取りする操作は `runGitOperation` を通す（自動のフェッチとぶつかると「cannot lock ref」で落ちる）。
- ファイルが入れ替わる操作は、作業中のチャット・コミットしていない変更があれば注意を添えて確かめる。マージ・リベースは先に見込みを出す。衝突したら「変更タブで解決する」か「取りやめる」を利用者が選ぶ。
- 作者の印に外の画像を取りに行かない。対話式のリベースは置かない。

## 落とし穴

- 右の欄の Git の状態は、知らせが続いても最初の知らせから 1.5 秒で取り直す（届くたびに待ち直さない）。
- 差分の表の行のクラスは `line-add` など（タイムラインの `.diff-add` とは別）。`ui:diff-layout` は差分のどこでも共通。
- Git の外・未追跡には行の横の帯・変更の記録を出さない。記録は保存した中身で取るので、未保存の間は出さない。
- 確認済みの印は差分の指紋（`diffFingerprint`）で覚え、差分が変わったら外す。
- 操作の窓は閉じてから実行する（確かめのダイアログを重ねない）。終わったら Git の状態（応答の状態は `applyStatus`）と履歴を取り直す。
