# GitHub と CI（`features/github`）

プロジェクトの「GitHub」タブ（issue・PR）と右の欄の GitHub のタブ、「CI」タブ、PR の知らせ。

## 地図

| ファイル | 中身 |
|---|---|
| `core/index.ts` | チャットの実行の環境変数（order 20。選んだアカウント） |
| `core/gh.ts`・`account.ts` | gh を動かす唯一の口（トークン・失敗の文 `ghFailureMessage`）・アカウントの文脈 `runAsGitHubAccount` |
| `core/service.ts`・`core/ghApi.ts` | `GitHubService`（`gh api`。書き込みは `write`）・CI の `CiService`（`ci.ts`） |
| `core/pulls.ts`・`routes/pulls.ts` | ブランチの PR（`@shared/github/contract.ts`）。「プッシュして PR を作る」は `ui/pushPrItem.ts` |
| `core/prWatch.ts` | PR の見張り `WorktreePrWatch`（CI の失敗も見る） |
| `ui/GitHubTab`・`useGitHubList`・`GitHubFilterBar` | 一覧と絞り込み（検索の文は `@shared/github/searchQuery`） |
| `ui/useGitHubDetail`・`GitHubDetail`・`GitHubPullChanges`・`GitHubHtml` | 中身・PR の変更（git の `DiffStack`・`ChangedFiles`）・本文 |
| `ui/githubHandoff.ts`・`githubPrompt.ts` | AI に渡す |
| `ui/MergeDialog`・`githubCheckout.ts`・`GitHubReview.tsx` | 書く（マージ・チェックアウト・レビュー） |
| `ui/githubRefresh.ts` | 取り直しの間隔 |
| `ui/ci/`・`ui/prNotice/` | CI のタブ・PR の知らせ。ほかの機能が開くのは行き先 `githubItem`・`ciRun`（`ui/openTargets.ts`） |

## 決まり

- この Mac のアプリの中だけ（`window.kickoff`）。ブラウザ・スマホではタブも右の欄の項目も出さない（CI も同じ）。GitHub・CI の口は端末に開かない。
- 中身は DB に持たない（一覧は ETag で聞き直す）。書いたらそのプロジェクトの覚えを捨てる。本文の画像は連携先のリポジトリの中だけを取る。
- 絞り込みと開いているものはプロジェクトごとに覚え、タブと右の欄で同じ値（`github:filters`・`github:selected`）。
- AI に渡すのは入力欄に入れるだけ。札は外から来た中身（`uploadsApi.capture`）。選んだ文は引用にして札にしない。
- 書くボタンは GitHub が許すときだけ出す（`viewer`・`can_*`）。マージはいつも確認し、見ていた `head_sha` で頼む。
- ダイアログは `openNewIssue`・`openMergeDialog`（土台の `openDialog`。タブの外からも開ける）。
- 2 欄は土台の `ListDetail`（中身の最小の幅 `DETAIL_MIN_WIDTH`）。CI の行は GitHub タブのクラス（CI だけのものは `ui/ci/` の部品の隣）。ログの色は土台の `AnsiText`。

## 落とし穴

- `gh api` の文字の変数は `-f`、数は `-F`（`-F` は `@` 始まりをファイルと読む）。REST の書き込みの本文は一時ファイルから（`send`）。304 は終わり値 1 なので状態の行で見分ける。
- GitHub の項目・`ci_watch`・アーカイブを変えたら `prWatch.checkProject` で聞き直す。
- 本文の HTML は `GitHubHtml` が DOMPurify で整える（input は押せない checkbox だけ）。画像は CSP の `img-src` のホストだけ（GitHub Enterprise はそのホストも足す）。非公開の画像はコアから読む。
- 覚えた中身（`githubApi.githubCachedDetail`）は、頼みの番号でなく、未表示の同じものかで受ける。
- 実行中の CI があれば短い間隔で取り直す（`CI_PENDING_REFRESH_MS`）。`ci_failed` が届いたら一覧を取り直す。失敗を知らせるかは `src/features/notifications/CLAUDE.md`。
- PR の状態の名前は `PR_STATE_LABELS`（gh の大文字は `prStateOf`）、チェックの状態は `CiState` 1 つ（`@shared/github/ciTypes`。画面で文字列を分類しない）。
- レビューの行は `reviewLines.ts` が差分の表の `DIFF_ROW_ATTRS` で読む。
- テストは `setup()` の `ghFake`（`routes.github.test.ts`・`routes.ci.test.ts`）と `ciView.test.ts`。
