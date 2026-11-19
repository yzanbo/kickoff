# GitHub・CI（`features/github`・`features/ci`）
<!-- 行き先: src/features/github/ -->

プロジェクトの「GitHub」タブ（issue・PR）と右の欄の GitHub のタブ、「CI」タブ。コアは `src/core/CLAUDE.md` の「GitHub タブ・CI のタブ」、API は `api/github.ts`・`api/ci.ts`。

| ファイル | 中身 |
|---|---|
| `GitHubTab`・`useGitHubList`・`GitHubFilterBar` | 一覧と絞り込み（検索の文との行き来は `@shared/github/searchQuery`） |
| `useGitHubDetail`・`GitHubDetail`・`GitHubPullChanges` | 中身・PR の変更 |
| `githubHandoff.ts`・`githubPrompt.ts` | AI に渡す（文と札は純粋。テストは隣） |
| `GitHubHtml`・`useGitHubBodyActions`・`githubLinks.ts` | 本文の表示とリンク |
| `MergeDialog`・`githubCheckout.ts`・`GitHubReview.tsx` | 書く（マージ・チェックアウト・レビュー） |
| `useGitHubRefresh.ts` | 取り直し（CI のタブも使う。古い応答は捨てる） |

## 決まり
<!-- 行き先: src/features/github/ -->

- この Mac のアプリの中だけ（`window.kickoff`）。ブラウザ・スマホではタブも右の欄の項目も出さない（CI も同じ）。
- 絞り込みと開いているものはプロジェクトごとに覚え、タブと右の欄で同じ値（`githubFilters`・`githubSelected`）。
- AI に渡すのは入力欄に入れるだけ。札は外から来た中身（`api.capture`）。選んだ文は引用にして札にしない。
- 書くボタンは GitHub が許すときだけ出す（`viewer`・`can_*`）。マージはいつも確認し、見ていた `head_sha` で頼む。
- ダイアログは `githubDialogs.ts` で頼み、App と別ウィンドウに 1 つずつの `GitHubDialogHost` が描く。

## 落とし穴
<!-- 行き先: src/features/github/ -->

- 本文の HTML は `GitHubHtml` が DOMPurify で整える。画像は CSP の `img-src` のホストだけ（GitHub Enterprise はそのホストも足す）。非公開の画像はコアの口から読む。
- 覚えた中身（`api.githubCachedDetail`）は、頼みの番号でなく、まだ何も出していない同じものかで受ける。

## CI（`features/ci`）
<!-- 行き先: src/features/github/ -->

- 枠と行は GitHub タブのクラスと `DETAIL_MIN_WIDTH` を使う（CI だけの見た目は `styles/ci/ci.css`）。
- ログの色は Docker と同じ `ansiSpans`・`SpanView`（`features/docker`）。
- 動いている実行がある間は短い間隔で取り直す（`CI_PENDING_REFRESH_MS`）。`ci_failed` が届いたら一覧を取り直す。
- ほかから開くのは `ciLinks.ts` の `openCiRun`（PR のチェックの「ログを開く」・失敗の通知）。知らせを出すかはコア（`src/core/CLAUDE.md` の「通知」）。
- テストは `ciView.test.ts`（開くジョブとステップ・札の中身・ログの行）。
