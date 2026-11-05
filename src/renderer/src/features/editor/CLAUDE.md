# エディタと履歴（`features/editor`・`features/history`）

プロジェクトの画面の「エディタ」タブ（Git の変更とファイル。URL は `#/projects/:id/changes`）と「履歴」タブ（`#/projects/:id/history`。部品は `features/history/`）。どちらも上の `WorktreePicker` で見る作業場所を切り替える（作業場所は共通。`features/worktree/CLAUDE.md`）。Git・ファイル・検索の操作先は `useGitTarget`（いま見ている作業場所に向けた `GitTarget`。API は `?worktree=`）。

## エディタ（`EditorTab`）

- 左端で表示を切り替える（VS Code と同じ。`CHANGES_VIEW`: `files` / `search` / `changes`）: すべてのファイル（エクスプローラー `FilesPane` ＋ `FileTree`。木は `useProjectFiles`・`treeModel.ts` の `buildTree`、変更のあるファイルとフォルダだけ色を変える `changeKinds`）・検索（`SearchView` ＋ `useProjectSearch`。大文字と小文字の区別・単語単位・正規表現。打つと探し直す。印は `searchMatch.ts` の `searchPattern` / `splitMatches`）・変更（ソース管理 `ChangesPane`）。選んでいるファイルは `useChangesSelection`（編集中に保存していない変更があれば、別のファイルを開く前に確かめる）、右側は `ChangesDetail`（変更があれば差分 `DiffView`、なければ中身 `FileView`。検索の行から開いたときは中身でその行を目立たせる）。左の一覧の幅は `CHANGES_LIST_WIDTH`（履歴と共通）。
- 変更（`ChangesPane`）: 見出しにブランチと進み・遅れ、一覧 / 木の切り替え（`CHANGES_TREE`）、取り直し。上にコミットの欄 `CommitBox`（⌘Enter でコミット。ステージしたものがなければ、すべてステージするか確かめる。進んでいればプッシュ、追いかけるブランチがなければ「ブランチを公開」）、下に「ステージされている変更」「変更」（`ChangeGroup`。行の右にステージ・ステージの取り消し・元に戻すのボタン（薄い色。乗せたボタンだけ濃くする。`FileTree` の `actions`・`.row-actions`）。元に戻すは確かめてから）。操作の実行中と失敗は親が持ち、表示を切り替えても残る。
- Git の状態は `useGitStatus`（開いたとき・ウィンドウに戻ったとき・このプロジェクトのチャットが動いたときに取り直し、変更のタブを開いている間は 5 秒ごとにも取り直す。`count` はタブのバッジ、`refreshing` はバッジの更新中の印（5 秒ごとの取り直しでは立てない））。
- 差分は `DiffView`（左右に並べる・1 列。`DIFF_LAYOUT`）。行に分けるのは `parseDiff` / `toSplitRows`。差分の表の行のクラスは `line-add` など（タイムラインの `.diff-add` とは別）。
- ファイルの中身は `FileView`（行番号つき。色付けは `useHighlight` ＋ `CodeLine`）。「編集」で `CodeEditor`（Monaco。押したときだけ読み込む。入口は補完・型チェックの言語サービスを除いた `monacoEditor.ts`。Monaco を上げたときは `editor.main.js` と見比べて作り直す）にし、⌘S・保存ボタンで保存する。保存は開いたときの指紋（`hash`）と比べ、ほかで（エージェントなどが）変えていれば上書きするか聞く。
- フォルダ・ファイルのアイコンは `FileIcon`（VS Code の Material Icon Theme。対応表 `fileIcons.ts` は使うときだけ読み込む）。
- チャットのファイル（返答のチップ・ターンの変更カード・ツールの行）は、ふだんはチャットの画面の右の欄に開き（下の「右の欄の変更とファイル」）、⌘クリック・右クリックの「エディタタブで開く」・右の欄の「エディタタブで開く」で `openProjectFile` によりこのタブのファイルを開く（URL の `?file=&line=&worktree=`。開いたら URL から外す）。
- 差分（`DiffView`）は、左右に並べる設定でも、2 つ並べると読めない幅（`SPLIT_MIN_WIDTH`。`hooks/useNarrowerThan`）では 1 列で出す（設定は変えない）。`bare` で見出しを出さない（右の欄の変更）。

## 右の欄の変更とファイル（`SideChanges`・`SideFileView`）

チャットの画面の右の欄（`features/panel/CLAUDE.md`）のタブの中身。チャットの作業場所（ワークツリーならそのフォルダ。`WorktreeContext` で渡す）を見る。Git の状態は `useGitStatus`（チャットが動いた・ウィンドウに戻ったら取り直すので、AI が作業を続けて変わっても差分が追いつく。5 秒ごとの取り直しはしない）。

- 変更（`SideChanges`）: コミットしていない変更のあるファイル（`sideFile.ts` の `changedFiles`。同じファイルは 1 つにまとめ、どの差分を出すかは `changeOf`: 競合 → 未ステージ → ステージ済み）を、上に一覧、下に差分を縦に並べる。上の帯に件数・表示のしかた（`DIFF_LAYOUT`。エディタタブと共通）・取り直し。押したファイル（タブの `focus` / `focusAt`。押し直しても移る）の位置へ移り、一覧の行でもそのファイルへ移る。ファイルごとに見出しで畳め（20 個より多ければ、初めは移る先のファイルだけ開く）、見出しはスクロールしても上に残る。見出しの右に「エディタタブで開く」、見出し・一覧の右クリックはファイルのメニュー。差分の行を選ぶと、コメントを入力欄に添えられる（`features/chat/CLAUDE.md` の「選んだ範囲へのコメント」）。
- ファイル（`SideFileView`）: 中身（`FileView`。編集・保存もできる。行の番号があればその行を目立たせる）。上の帯に、コミットしていない変更があれば「差分を見る」（変更のタブのそのファイルの位置へ）と「エディタタブで開く」。
- タブの名前の前は、ファイルの種類のアイコン（`FileTabLead`）。

## 履歴（`features/history/HistoryTab`）

Fork と同じ形: 左にブランチ・リモート・タグ・stash・ワークツリーなどの一覧 `HistorySidebar`（名前で絞り込め、押すとそのコミットを表で選ぶ。まとまりは `RefSection` / `RefItem`。ワークツリーの作成・削除は `useWorktreeActions`）、右上にコミットの表 `CommitTable`（線つきの件名・作者・番号・日時 `formatDayTime`）、右下に選んだコミットの詳細 `CommitView`（「コミット」「変更」のタブ。変わったファイルは木・一覧 `COMMIT_FILES_LIST`、差分は `DiffView` の `commit`）。上下の境目はドラッグで動かせる（`HistoryMain`・`HISTORY_SPLIT`）。読み込みは `useGitLog`（表示している間だけ読み、「さらに読み込む」で続きを足す）、ブランチの線は `commitGraph.ts` の `layoutGraph`。
