# プロジェクト（`features/project`）

プロジェクト全般（印・札・色・タグ・並び・メニュー・絞り込み）、プロジェクトの画面（`page/`）、編集のダイアログ（`settings/`）、新しいプロジェクト（`new/`）。サイドバーのカード・見出しの行は `features/sidebar/CLAUDE.md`、ボードは `features/board/CLAUDE.md`。

## 印・札・色

- プロジェクトの色を出すのは印 `ProjectMark` だけ（プロジェクトの色の角丸の四角に頭文字 `initialOf`。`size` は `sm` = 16px（バッジ・メニュー・段・⌘⇧F / ⌘⇧A の絞り込み）/ `md` = 20px（サイドバーの見出し・画面の見出しの名前）。`project` がなければ全プロジェクトの灰色の印）。CSS は `styles/project/project-mark.css`、色は横スライドの丸 `.workspace-dot` と同じ。
- 名前を出す札は、どこでも「印 ＋ 名前 ＋ プロジェクトの色の薄い地」の形にそろえる（地と枠の色は `project-mark.css` の `.workspace-head` / `.project-switch` / `.project-chip` に 1 か所で持つ。色は要素か親の `--ws-hue`（`projectHueStyle`）。後ろのファイルの各部品の規則では地と枠の色を書かない（`border` の一括指定も枠の色を消すので `border-width` / `border-style` で書く）。全プロジェクトの見出しは灰色）。名前は普通の文字色、開閉の矢印は灰色、カンバンのカードに色の線は付けない。
- バッジは `ProjectChip`（押してカンバンを開くなら `linked`、名前の代わりに選択欄などを置くなら children）。
- プロジェクトの色はプロジェクトの `hue`（`@shared/project/colors.ts` の `PROJECT_HUES` の 10 色から、作ったときにほかと被らない色を `pickProjectHue` で選んで覚える。編集の「基本情報」で変えられる）。画面は `projectHue(id)` で読む（App がプロジェクトの一覧を読むたびに `setProjectHues` で入れる）。

## 並び・絞り込み・メニュー

- サイドバーの並びは `projectOrder.ts` の `sidebarOrder`（上に固定したものが先、そのあとドラッグで並べ替えた順。しまったものは出さない）、最近動いた順は `recentOrder`（固定したものの次は、チャットが最後に動いた順）、しまったものは `archivedProjects`（名前順）。サイドバーと同じく見せるプロジェクトは `useVisibleProjects`（`active` = しまっていないもの・`visible` = そのうちタグの絞り込みに合うもの・`archived`。サイドバー・全プロジェクトの画面・⌘⇧A・パネルのタブ・下のパネルで共通。最近動いた順のときだけチャットの一覧から並びを読み、並びが変わらなければ描き直さない）。
- 固定・しまう・タグの変更は `changeProject`（失敗はお知らせ）。アーカイブするときも戻すときも確かめる（`confirmArchiveProject` / `confirmRestoreProject`）。
- 右クリックのメニューは `useProjectMenu`（サイドバーの見出しのカード・下の丸）。操作をまとまりに分けて並べる: このプロジェクト（新しいチャット・グループを作成・Finder）/ 整理（固定・開閉・アーカイブ）/ タグ（使っているタグのチェック・「新しいタグ…」）/ 編集・削除（`ProjectEditDialog`）。すべてのプロジェクトに効く設定はここに入れず、サイドバーの見出しの行に置く。
- チャットのメニューの「プロジェクトを変更」で横に開く一覧は `ProjectPickFlyout`（上に「プロジェクトを検索または作成」の欄、「新規プロジェクト」、区切り線、サイドバーの並びのプロジェクト（いまのプロジェクトにチェック。しまったものは出さない））。右に入らなければメニューの左に出し、ほかの項目に乗せる・← で閉じる。Enter は絞り込んだ先頭、合うものがなければ書いた名前で作る。↑↓ は一覧の中だけで動く（`useMenuKeys` は `data-menu-scope` の内と外を分ける）。「新規プロジェクト」は `new/openNewProject.ts` の `openNewProject({ name, onCreated })` で App の新しいプロジェクトのダイアログを開き、作ったらそのプロジェクトへ移す。

## タグ

- タグはプロジェクトの `tags`（文字の配列。`api.updateProject` の `tags` で置き換え、前後の空白・重複を除く。上限は `MAX_TAG_LENGTH`（30 文字）・`MAX_TAGS`（20 個）。整え方・照らし合わせ・一覧は `@shared/project/tags.ts`）。
- 付け方は編集の「基本情報」の `TagEditor`（Enter・読点・カンマで足し、× で外す。ほかのプロジェクトのタグを候補に出す（↑↓・Enter・Esc）。足す・外すと、すぐ保存する。入力欄を先に置く: `Field` は label なので、名前を押したときに最初のチップの × が押されないように）と、右クリックのメニューの「タグ」。表示は小さなチップ `ProjectTags`（サイドバーのカードの 2 行目、チャット数の後ろ）。
- 絞り込みは `projectTagFilter.ts` の `useProjectTagFilter()`（`tags`（使っているタグ・名前順）/ `selected` / `active` / `toggle` / `clear` / `matches(project)`）。保存は `PROJECT_TAG_FILTER`（選んだタグの配列。`""`（`UNTAGGED`）はタグなし。空なら絞り込まない。部品どうしでそろう）。どのプロジェクトにももう付いていないタグは選んでいないものとして扱う。効かせる場所: サイドバーの並び（どの並べ方でも。⌃Tab・⌥⌘← → ・⌃1〜9 もこの並び）・「自分待ち」の数・全プロジェクトの画面（カンバン・状態ごとの数）・⌘⇧A。合うプロジェクトがないときはその旨と「絞り込みを外す」を出し、サイドバー以外の画面には絞り込んでいる印 `TagFilterNotice`（× で外す）を出す。

## プロジェクトの画面（`page/`）

- `ProjectPage`（データは `useProjectData`。プロジェクト・チャット・グループの店から読み、まだ届いていないものがあれば、届くまで前に出していたプロジェクトの画面を薄くして出す。もうないとわかったプロジェクト（消した・URL の番号が違う。`useProjects().missing`）は中身の部品を出さず（グループ・Git の状態を読みに行かない）、案内だけを出す（`ProjectsEmpty.tsx`）: プロジェクトが 1 つもなければ始め方の案内 `NoProjectsWelcome`（何をする所か・始め方の 3 段（用意する → チャットで頼む → 自分待ちで受け取る）・新しいプロジェクト / 既存のフォルダを取り込む。全プロジェクトの画面の空のときと共通。しまったプロジェクトだけがあれば「表示中のプロジェクトがありません」とその数）、ほかにあれば `MissingProject`（ID と理由・全プロジェクトへ / 新しいプロジェクト・ほかのプロジェクトの一覧（サイドバーと同じ並びで 6 件まで））。取り込むボタンは `openNewProject({ mode: "import" })` で、ダイアログを取り込む側で開く。App も、そのプロジェクトをチャット欄・下のパネル・下の帯に渡さない）。タブはボード（カンバン・グループのボード）・エディタ（`changes`）・履歴（`history`）。どのタブでも同じ横幅にする。本体はいつも `.project-main`（横並び）＞ `.project-content`（縦に伸ばす）に入れる（置き方で DOM の深さを変えない）。
- 見出し `ProjectHeader`: 名前（`ProjectSwitcher`）・設定の歯車（編集のダイアログ）・しまったものを戻すボタン・フォルダの場所（Finder で開く）・状態ごとのチャット数 `StateStats`（作業中・回答待ち・未読。押すと `StateChatsPopover`）と、横並びのときはタブの列（`.project-tabs-row`）。
- 画面の見出しの名前 `ProjectSwitcher`（全プロジェクトの画面は `project` なし）: 押すと全プロジェクト・ほかのプロジェクトを選べ、プロジェクトどうしはいまのタブのまま切り替わる（全プロジェクトから選んだときはカンバン）。メニューの先頭で全プロジェクトに戻る。しまったプロジェクトは下の「アーカイブ済み」に分ける。
- タブの置き方は設定の「表示」→「プロジェクトのタブ」（上に横並び / 左に縦並び（アイコン）。`PROJECT_TABS_LAYOUT` の `top` / `side`、初めは `side`。`useProjectTabsLayout`、名前は `PROJECT_TABS_LAYOUT_LABELS`）と、タブの列の右クリック（`ChoiceMenu`）で切り替える。縦並びは本体の左 `.project-side-tabs`（アイコンだけ。名前と数は title と aria-label）で、見出しの下の行がなくなり本体の縦の幅が広がる。
- タブの数（`ProjectTabs`）: ボードには状態ごとのチャット数（`StateCornerCounts`。縦並びはアイコンの角に重ね、横並びは名前の後ろに `inline`）、エディタには変更のあるファイルの数（チャットの状態の色と被らない紫 `--sec-schedule` の地に白い字。`.tab .change-count`）。VS Code のバッジと同じく、取り直している最中は数の代わりに回る印 `.tab-refreshing` を出す（ボード = チャットの一覧の読み込み、エディタ = `useGitStatus` の `refreshing`（開いた・ウィンドウに戻った・チャットが動いた・取り直しのボタン。5 秒ごとの取り直しでは立てない）。すぐ終わる取り直しでも見えるよう `useBusyBadge` で少なくとも 0.5 秒は出す）。

## 編集のダイアログ（`settings/`）

プロジェクト名の横の歯車・サイドバーの右クリックから開く `ProjectEditDialog`（`TabbedDialog`。画面は移らない）。項目は `PROJECT_SETTINGS_SECTIONS`: 基本情報（名前・説明・色・タグ。`BasicInfo`）・参照資料（AI がいつでも読めるフォルダ・ファイル。その場で保存。`ReferenceEditor`）・AI（どの AI を使うかのカードと、その AI の既定 `AiSection` / `AiDefaults`。「アプリの設定に従う」を選べる）・削除（`DeleteProject`）。

## 新しいプロジェクト（`new/`）

`NewProjectDialog`（新規作成 `CreateForm` / 既存フォルダの取り込み `ImportForm`（点検の結果 `InspectionPanel`）。フォルダは `FolderField`（アプリでは「選択…」で Finder から選べる））。部品からは `openNewProject(request)` で開く（App が受け取る）。作ったら知らせを待たずに店へ入れ（`addProject`）、そのプロジェクトで新しいチャットを開く（`onCreated` があればそれに任せる）。
