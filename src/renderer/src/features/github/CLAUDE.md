# GitHub（`features/github`）

プロジェクトの「GitHub」タブ（`#/projects/:id/github`）と、チャットの画面の右の欄の GitHub のタブ（`features/panel/CLAUDE.md` のタブの種類 `github`）。連携先のリポジトリの issue・PR を「issue｜PR」で切り替えて見る。いまは要件定義書の「5.11 GitHub」の段階 1「読む」まで（AI に渡す・書くはまだ）。コアは `src/core/CLAUDE.md` の「GitHub タブ」、API は `api/github.ts`。

- この Mac のアプリの中だけ（`window.kickoff`）。ブラウザ・スマホから開いたときはタブも右の欄の項目も出さない（コアの口が 127.0.0.1 からだけ受ける `localOnly`。DB クライアントと同じ）。
- `GitHubTab`: 初めに連携を確かめ（`api.githubConnection`）、使えなければ（remote がない・gh がない・ログインしていない）理由と直し方・「もう一度確かめる」を `EmptyState` で出す。使えれば `GitHubBrowser`: 左に一覧（幅はつまみ `GITHUB_LIST_WIDTH`）、右に開いたものの中身。中身の欄に 440px（`DETAIL_MIN_WIDTH`）が残らない幅（右の欄など）では、一覧と中身を切り替えて 1 つずつ出す（中身の見出しの ← で一覧へ）。隠れて幅 0 の間は切り替えない。
- 絞り込み（`GitHubFilterBar`）: issue｜PR の切り替え・件数・取り直し、検索の欄（打つのが止まって 0.5 秒か Enter で決める。GitHub の検索の書き方（`is:draft` など）もそのまま足す）、札（状態・自分・ラベル（いくつも選べる）・担当・マイルストーン・並べ方。既定から変えた札は色を付け、「絞り込みを外す」）。候補は `api.githubMeta`。絞り込みは issue と PR で別々に、プロジェクトごとに覚える（`githubFilters(プロジェクト)`。形と既定・読み直しは `lib/githubFilters.ts`、GitHub の検索の文にするのは `@shared/github/searchQuery`）。開いているものも覚える（`githubSelected(プロジェクト)`。「issue:12」「pr:5」）。プロジェクトのタブと右の欄で同じ値。
- 一覧（`useGitHubList` ＋ `GitHubItemRow`）: 状態のアイコン（issue の開いている / 完了 / 対応しない、PR の下書き / 開いている / マージ済み / 閉じた。`GitHubStateIcon`）・題名・ラベル（GitHub の色）・番号・作った人・更新・PR はレビューとチェックの成否・コメント数。50 件ずつで「さらに読む」。
- 中身（`useGitHubDetail` ＋ `GitHubDetail`）: 見出しに題名・状態・作った人・ラベル・担当・マイルストーン、PR はブランチ（fork なら持ち主を添える）・増減・ファイル数・レビュー・衝突。issue は本文と会話の流れ（`GitHubTimeline`: コメント・レビュー（その行のスレッドも）・コミット・出来事）、PR は「会話 / 変更 n / チェック n」の切り替え。
  - 変更（`GitHubPullChanges`）: ファイルごとの見出し（開閉・名前の変更・状態・スレッドの数・増減。流しても上に残る）と 1 列の差分（`features/editor` の `UnifiedDiff` と `useDiffHighlight` を使い回す）。行のスレッドはその行の下に出す（RIGHT は新しい側の行、LEFT は古い側の行。割り当ては純粋関数の `pullThreads.ts`、テストあり）。いまの差分にない行へのスレッド（古い差分・差分の外）はファイルの下にまとめる。20 ファイルより多い PR は初めは畳む。読むのは「変更」を開いたときで、PR の最新のコミット（`head_sha`）が変わったら読み直す。大きすぎる・バイナリのファイルは GitHub で見るよう出す。
  - チェック（`GitHubChecksList`）: 落ちた → 途中 → 通った → ほか の順に、ワークフロー / 名前・説明・GitHub の詳細へのリンク。ログを読む・AI に渡すは入れない（要件 5.11）。
- 本文・コメントは GitHub が作った HTML（`bodyHTML`）を `GitHubHtml` が DOMPurify で整えて出す（リンクは外のブラウザで開くよう `target="_blank"`、相対の URL は github.com に直す。画像は CSP の `img-src` で github.com・`*.githubusercontent.com` を許している）。
- 取り直し（`useGitHubRefresh`）: 開いたとき・取り直しのボタン・窓に戻ったとき・開いている間は 1 分ごと（Kickoff が前にあるときだけ）。取り直している間は前の中身のまま「更新中…」を出し、古い応答は捨てる。一覧はコアが ETag で変わっていないことを確かめて覚えたものを返すので、1 分ごとでも GitHub の使用量はほとんど増えない。
- CSS は `styles/github/`（`github-list` 一覧と絞り込み・`github-detail` 中身の見出し・`github-timeline` 会話の流れとスレッド・`github-files` PR の変更）。
