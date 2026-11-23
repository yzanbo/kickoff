# GitHub と CI（`src/features/github`）

プロジェクトの「GitHub」タブ（issue・PR）と右の欄の GitHub のタブ、「CI」タブ、PR の知らせ。

## 地図

| ファイル | 中身 |
|---|---|
| `core/index.ts` | チャットの実行の環境変数（order 20。選んだアカウント） |
| `core/gh.ts`・`account.ts` | gh を動かす唯一の口（トークン・失敗の文 `ghFailureMessage`）・アカウントの文脈 `runAsGitHubAccount` |
| `core/service.ts`・`core/ghApi.ts` | `GitHubService`（`gh api`。書き込みは `write` に `writes.ts` の関数を渡す。問い合わせ `queries.ts`・純粋な `normalize.ts`）。CI の `CiService`（`ci.ts`・`ciNormalize.ts`）も同じ口 |
| `core/pulls.ts`・`routes/pulls.ts` | ブランチの PR（取り決め `@shared/github/contract.ts`）。履歴の「プッシュして PR を作る」は `ui/pushPrItem.ts`（git の `branchMenuItems`） |
| `core/prWatch.ts` | PR の見張り `WorktreePrWatch`（CI の失敗も見る） |
| `ui/GitHubTab`・`useGitHubList`・`GitHubFilterBar` | 一覧と絞り込み（検索の文との行き来は `@shared/github/searchQuery`） |
| `ui/useGitHubDetail`・`GitHubDetail`・`GitHubPullChanges`・`GitHubHtml` | 中身・PR の変更・本文の表示 |
| `ui/githubHandoff.ts`・`githubPrompt.ts` | AI に渡す（文と札は純粋。テストは隣） |
| `ui/MergeDialog`・`githubCheckout.ts`・`GitHubReview.tsx` | 書く（マージ・チェックアウト・レビュー） |
| `ui/useGitHubRefresh.ts` | 取り直し（CI のタブも使う。古い応答は捨てる） |
| `ui/ci/`・`ui/prNotice/` | CI のタブ（開くのは `ciLinks.ts` の `openCiRun`）・PR の知らせ |

## 決まり

- この Mac のアプリの中だけ（`window.kickoff`）。ブラウザ・スマホではタブも右の欄の項目も出さない（CI も同じ）。GitHub・CI の口は端末に開かない。
- 中身は DB に持たない（一覧は ETag で聞き直す）。書いたらそのプロジェクトの覚えを捨てる。本文の画像は連携先のリポジトリの中だけを取る。
- 絞り込みと開いているものはプロジェクトごとに覚え、タブと右の欄で同じ値（`github:filters`・`githubSelected`）。
- AI に渡すのは入力欄に入れるだけ。札は外から来た中身（`api.capture`）。選んだ文は引用にして札にしない。
- 書くボタンは GitHub が許すときだけ出す（`viewer`・`can_*`）。マージはいつも確認し、見ていた `head_sha` で頼む。
- ダイアログは `githubDialogs.ts` で頼み、App と別ウィンドウに 1 つずつの `GitHubDialogHost` が描く。
- CI の枠と行は GitHub タブのクラスと `DETAIL_MIN_WIDTH` を使う（CI だけの見た目は `@/app/renderer/styles/ci/ci.css`）。ログの色は Docker と同じ `ansiSpans`・`SpanView`。

## 落とし穴

- `gh api` の文字の変数は `-f`、数は `-F`（`-F` は `@` で始まる値をファイルとして読む）。REST の書き込みの本文は一時ファイルから渡す（`send`）。gh は 304 で終わり値 1 なので状態の行で見分ける。
- GitHub の項目・`ci_watch`・アーカイブを変えたら `prWatch.checkProject` で聞き直す。
- 本文の HTML は `GitHubHtml` が DOMPurify で整える。画像は CSP の `img-src` のホストだけ（GitHub Enterprise はそのホストも足す）。非公開の画像はコアの口から読む。
- 覚えた中身（`api.githubCachedDetail`）は、頼みの番号でなく、まだ何も出していない同じものかで受ける。
- 動いている実行がある間は短い間隔で取り直す（`CI_PENDING_REFRESH_MS`）。`ci_failed` が届いたら一覧を取り直す。失敗を知らせるかは `src/features/notifications/CLAUDE.md`。
- テストは `setup()` の `ghFake`（`server.github.test.ts`・`server.ci.test.ts`）と `ciView.test.ts`（開くジョブとステップ・札の中身・ログの行）。
