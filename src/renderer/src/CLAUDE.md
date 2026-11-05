# 画面（`src/renderer/src`）の決まり

画面全体の決まり（置き場所・データの持ち方・保存・API・共有部品・表示・性能）を書く。機能ごとの振る舞いは `features/<領域>/CLAUDE.md`、CSS は `styles/CLAUDE.md`。

## フォルダと依存の向き

| フォルダ | 役割 |
|---|---|
| `app/` | App・ルーター（`router.ts`）・全体の context（`chatStatesContext.ts`）・アプリ全体のショートカット（`shortcuts.ts`）・通知（`notifications.ts`）・テーマ（`theme.ts`）・右上のレイアウトの開閉（`LayoutToggles`）・⌘[ / ⌘]（`useChatHistory`）・起動したときの保存の片付け（`prepareStorage.ts`）・別ウィンドウの行き先と画面（`popout.ts`・`PopoutApp`）・ウィンドウの間の知らせ（`windowBus.ts`。App が受けるものは `mainWindowMessages.ts`） |
| `api/` | サーバーとのやり取り（下の「API」） |
| `stores/` | 画面全体で 1 つずつ持つサーバーのデータ（下の「データ」） |
| `lib/` | React に依存しない小さな補助（`cx` `time` `format` `url` `keys` `floating` `highlight` `languages` `richCopy` `valueCell`、保存の `storage` とその一覧 `storageKeys`） |
| `hooks/` | ドメインを知らない hooks |
| `ui/` | ドメインを知らない部品（下の「共有部品」） |
| `features/<領域>/` | 領域ごとの部品と hooks |
| `styles/` | CSS（`styles/CLAUDE.md`） |

`features/` の領域と説明の置き場所: `chat/`（チャット全般と 1 つのチャットの画面。`dictation/`（チャット欄の音声入力）・`fileLinks/`（返答のファイルのチップ）もここに書く）・`chatList/`（まとめ方・数え方・開閉）・`sidebar/`（`group/` もここ）・`board/`・`panel/`（右のパネル・チャット欄・下のパネルのタブ）・`project/`・`palette/`・`editor/`（`history/` もここ）・`worktree/`・`settings/`（`usage/` `footer/` `diagnostics/` もここ）・`terminal/`（`browser/` `openWith/` もここ）・`popout/`（右の欄のサブエージェント・変更・ファイル・メモと子チャットの別ウィンドウ）・`memo/`（プロジェクトの「メモ」タブとチャットの「メモに追加」）。

- 依存の向きは `app → features → stores / api / ui / hooks / lib → @shared`。ui / hooks / lib / stores / api は features を import しない。app の全体のもの（`router.ts` の `useRoute` / `openChat` など・`chatStatesContext.ts` の `useChatStates`）は features から読んでよい。
- import は、同じフォルダなら `./`、それ以外は `@/…`、プロセスをまたぐ型と純粋な関数は `@shared/…`（型は `@shared/types`、`errorMessage` は `@shared/errors`）。`../` で上のフォルダをたどらない。
- 複数のファイルになる機能は `features/<領域>/` にまとめ、大きければサブフォルダに分ける（`chat/queue/` など）。どの領域にも属さない汎用のものだけを ui / hooks / lib に置く。
- 大きな部品は「状態と操作の hook（`useXxx`）」と「描く部品」に分ける（`usePanel` ＋ `Panel` / `PaneTabBar` / `PanelTabPage`、`useSidebar` ＋ `Sidebar`、`useProjectNav` ＋ `ProjectStack` / `ProjectSlides`、`useWorkspaceRows` ＋ `WorkspacePage`、`useChatView` ＋ `ChatView`、`useProjectData` ＋ `ProjectPage`）。要素に渡す props の束も hook から返してよい（`sidebar.layout`、`useBoardPanel` の `body` / `frame`）。
- 画面（ルート）を増やす前に、ダイアログや右のパネルで足りないか考える（設定は左下の歯車・⌘, から開くダイアログ）。ルートは `app/router.ts` の `Route`。チャット・新しいチャットは、プロジェクトのチャットのパネル（`kanban:<プロジェクト>`）で開く（`openChat` / `openNewChat`。全プロジェクトの画面からも、そのプロジェクトへ移って開く）。パネルの置き場所は設定の「チャットを開く場所」（`CHAT_PLACEMENT`）で、ボードと分けた「チャット」タブ（初め）か、ボードの右（`features/panel/CLAUDE.md` の「欄の殻」）。

## データ（`stores/` と全体の context）

- サーバーのデータは店に 1 つずつ持ち、部品ごとに取り直さない・props で 3 段以上中継しない。店は `createStore`（値 1 つ）/ `createKeyedStore`（プロジェクトの ID などの key ごと）で作り、読み込み（同時に頼まれても 1 回）・失敗（覚えずに、間隔を伸ばして自動で取り直す）・サーバーの知らせでの更新（`reduce` / `reloadOn` / `dropOn`）・SSE がつながったときの取り直し・`maxAge` / `refreshOnFocus` を同じ形で持つ（考え方は `stores/createStore.ts` の先頭）。React からは `useStore` / `useKeyedStore` / `useKeyedStores`（いくつかの key。渡した key が変わったときだけ描き直す）/ `useStoreStatus`。閉じているポップオーバーなどは `active: false` で読み込みを頼まない。
- 店: チャットの一覧 `stores/chats.ts`（`useChats({ projectId?, archived?, enabled? })`。全プロジェクトで 1 つで、アーカイブ済みは頼まれたときだけ読む。`useChatsValue`・`useChatsByProject`・部品の外では `currentChats`）、`useProjects()`（`projects` / `projectsById` / `projectName(id)` / `loaded` / もうないとわかったか `missing(id)`。`projects.find((p) => p.id === …)?.name` を書かない）、`useGroups` / `useGroupsOf` / `useGroupName`、`useWorktrees` / `useWorktreesOf`、`useApprovals`、`useAppSettings`（`settingsStore`）、`usageStore`、`useProviders` / `useGitHubStatus` / `useModels`、`useVoiceStatus`、プロジェクトのメモの一覧 `useMemoList`（`stores/memos.ts`）。領域だけのデータは、その領域で店を作ってよい（`/` `@` の候補・外で開くアプリの一覧など）。
- 操作の応答で届いた値は `set` / `update` で入れ、知らせを待たずに画面をそろえる（作ったプロジェクトは `addProject`、ワークツリーの一覧は `worktreesStore.set`）。
- チャットの状態（作業中・回答待ちなど）は `features/chat/chatState.ts` の `chatStateOf(chat, pending)` で決める。回答待ちの引き当ては App が `indexApprovals` で 1 回作り、`useChatStates()`（`approvals` / `pending` / `stateOf(chat)` / `pendingCount(chatId)`）で配る（部品で `api.approvals()` を呼ばない）。
- いまのルートは `useRoute()`（App が `useHashRoute()` で 1 回購読して `RouteContext` で配る）。

## 表示の設定の保存（`lib/storage.ts`・`lib/storageKeys.ts`）

- localStorage / sessionStorage に残すもの（開閉・切り替え・幅・書きかけの文など）は、`lib/storageKeys.ts` でだけ `defineSetting(key, 形, { ids?, session? })` / `defineSettingFamily(prefix, 形)`（ID ごと。キーは頭 ＋ ID）で宣言する。形は `flag` / `optionalFlag` / `choice` / `number` / `text` / `list` / `record` / `json`。部品にキーの文字列を書かない。ここに宣言していない `kickoff:` のキーは、起動したときに消える（`pruneUndeclared`）。
- 別ウィンドウ（`features/popout/CLAUDE.md`）とは localStorage を共有し、ほかのウィンドウが書き換えた設定も `storage` の知らせで読んでいる部品に届く（sessionStorage はウィンドウごと）。
- 読み書きは React なら `useSetting(SETTING)` / `useSetting(family(id))`（同じ設定を読む部品どうしでそろい、`set` は参照が変わらないので memo した部品に渡せる）、保存しない入力欄もあるなら `useOptionalSetting`、React の外は `readSetting` / `writeSetting`。localStorage を部品から直接読み書きしない。
- キー名と保存する値は変えない（利用者の表示の好みを残すため）。選択肢を増やすときも、今までの値はそのままの意味で読めるようにする。
- プロジェクト・チャット・グループなどの ID を、キーか値に含むものは `ids: true` を付ける。起動したときに `prepareStorage`（`main.tsx` が App より先に呼ぶ）が `/api/status` の `database_id` と覚えた値（`DATABASE_ID`）を比べ、違えば `forgetIdSettings` で捨てる（DB を作り直すと ID が 1 から振り直され、別のものを指すため）。
- まとまりの開閉は `FOLDS` 1 つ（`hooks/useFold`。説明は `features/chatList/CLAUDE.md`）。

## API（`api/`）

- 通信の土台は `api/http.ts`（`request` / `postForm` / クエリの組み立て `withQuery` / 失敗 `ApiError`）だけで、資源ごとの関数は `api/<資源>.ts`（コアの `http/routes/<資源>.ts` と対応）に書き、`api/index.ts` で `api` 1 つにまとめる（名前が重なると後のもので上書きされるので、重ならないことを `index.test.ts` で確かめる）。本文・応答の型は `@shared/types`（`api.ts`）で、画面で書き直さない。
- SSE は App が `useServerConnection` で 1 回つなぎ、`api/events.ts` で配る（部品は `useServerEvent`、部品の外は `subscribeServerEvent`。つながったときは `subscribeServerOpen`）。

## hooks と補助

- window のイベントは `useWindowEvent`（effect の中で `addEventListener` しない。ほかより先に受け取るなら `capture`）。いまのテーマ（ダーク・ライト）は `hooks/useAppliedTheme.ts` の `useAppliedTheme`（React の外は `lib/appliedTheme.ts`。テーマを決めて出すのは `app/theme.ts`）。Kickoff が前にあるかは `useWindowFocused`、ネットワークは `useOnline`。
- サーバーから読む: 店にないもの 1 つは `useAsync`、key（ファイル・コミット・作業場所など）ごとは `useKeyedAsync`（key が変わるまで前の表示を残す。`loaded`）。
- 操作の実行中と失敗は `useAction`（`run` で busy と失敗の文、`guard` は失敗だけ受け止める）、保存のボタンは `useSave` ＋ `SaveActions`、送れたら閉じるフォームは `useSubmit`。失敗をお知らせのダイアログで出すなら `ui/dialogs.tsx` の `reportFailure(title)`。
- キーの判定は `lib/keys.ts`（日本語入力の変換中 `isComposing`・送る Enter `isSubmitKey`・やめる Esc `isCancelKey`・修飾キー `hasModifiers` / `isKey`・使い切る `consumeKey`）。変換を確定する Enter・変換をやめる Esc を操作に使わない。書き直しの欄（Enter で決める・Shift+Enter で改行・Esc でやめる）は `useEditKeys`、⌘ を押している間は `useHeldMeta`。
- ↑↓ で選ぶ位置は `stepIndex`（端で回り込む）、候補の一覧は `useListNavigation`、複数選択（⌘ / Ctrl で足す・外す、Shift で範囲を足す）は `useMultiSelect`。
- つまみで欄の大きさを変えるのは `useDragSize`（設定に覚え、ダブルクリックで初めの値に戻す。つまみは `.pane-resizer`）。横に並べた右側の欄の幅と、もう一方を覆う（横幅いっぱい・残す側が狭すぎれば覆う）のは `useCoverableWidth`（ボードの右のパネル・チャットの画面の右の欄）。中身が伸びていく欄で最新に付いていくスクロール（上へ戻したら止まる）は `useFollowScroll`。中身が横にあふれるときだけ詰めた表示にするのは `useOverflowCompact`（決め打ちの幅で切り替えない）。時間とともに変わる表示は `useTicker`。取り直し中の印を少しの間は出すのは `useBusyBadge`。
- 例外の文は `errorMessage`（`e instanceof Error ? e.message : String(e)` を書かない）、class 名は `cx`、時刻は `lib/time.ts`（`relativeTime` / `shortRelativeTime` / `formatClock` / `formatDayTime` / `formatMessageTime` / `formatElapsed` / `formatReset`）、トークン数は `formatTokens`、パスの名前とフォルダは `splitPath` ＋ `PathParts`。

## 共有部品（`ui/`。手書きしない）

- アイコンだけのボタン: `IconButton` / `CloseButton` / `RefreshButton`。`label` が aria-label とマウスを乗せたときの説明になる（説明を変えるなら `title`、ショートカットは `keys`）。`<button className="icon-button">` も、アイコンだけの `<button>` も手で書かない（タブの × も `CloseButton`）。
- マウスを乗せたときの説明: 要素に `data-tip`（説明）・`data-tip-title`（見出し）・`data-tip-keys`（キー）を付けると、App が置く 1 つの `HoverTip` が出す。「名前（説明）」の文は `tipProps(label)` で分ける。title と重ねて付けない。
- 押すと開く一覧・詳細: `Popover` ＋ `usePopover`（基準の要素の下・上に出し、描いてから測って画面に収める。基準が消えた・隠れたら閉じる。見出しは `title` で `PopoverHeader`）。外側のクリックと Esc で閉じるのは `useDismiss`（`escape`: `stop` = いちばん上だけ / `pass` / `none`。開いている間は `<html data-dismissable>` でウィンドウのドラッグ領域を止める）。
- 右クリック・「…」・▾ のメニュー: `PopupMenu` ＋ `MenuItem`（閉じてから実行。`role` / `checked` / `danger` / `title`）、項目の横に開く子のメニューは `useSubmenu` ＋ `MenuFlyout`（乗せる・押す・→ で開き、← で戻る。「プロジェクトを変更」など）、開閉と置き場所は `useContextMenu`（`open` = 右クリックの位置 / `openBelow` / `toggle` = 開いているときに押したら閉じる。`PopupMenu` の `ignore` にボタンのセレクタ）。メニューは描いてから自分の大きさを測って画面に収めるので、呼ぶ側で大きさを見積もらない。開いたらメニューそのものにピントを置き（項目は選んでいない状態から）、↑↓ で移る（`useMenuKeys`。`PopupMenu` が効かせるので重ねて呼ばない。移った項目は緑の枠ではなく、乗せたときと同じ地の色で示す）。1 つ選ぶだけのメニューは `ChoiceMenu`、チャット欄の選択は `OptionMenu`。
- ダイアログ: 確認・入力・お知らせは `confirmDialog` / `promptDialog` / `alertDialog`、3 つ以上から選ぶなら `choiceDialog`（「次からはこれにする」を添えるなら `choiceDialogWithRemember`。取り消せない選択肢は `danger`）。モーダルは `useModalDialog`（入力中に閉じたくないフォームは `closeOnBackdrop: false`、最初のボタンに枠を出さないなら `focusSelf`）。左に項目・右に内容は `TabbedDialog`。下のボタンの行は `DialogActions`。
- フォーム: 1 行は `Field`（入力欄が 1 つなら label、いくつも並ぶなら `as="div"`）、説明付きのチェックは `CheckField`、名前で絞り込む欄は `SearchField`、その場で名前を変えるのは `InlineName`、失敗の文は `ErrorText`（空なら何も出さない）、結果の文は `ResultMessage`。
- 中身がない・見つからない画面の案内: `EmptyState`（アイコン・見出し・説明・操作のボタン・下に添えるもの（手順・移れる先の一覧））。文 1 行だけで済ませず、なぜ空なのかと次にできることを出す。
- 1 つを選ぶボタンの組: `Segmented`（見た目は className。数は `badge`、説明は `tip`、キーは `keys`、アイコンだけなら `iconOnly`）。
- 開閉: まとまりの見出しは `FoldHead` / `FoldSection`（`look`: `row` / `group` / `section` / `lane`）、開閉の矢印は `GroupToggle` / `Chevron`、高さをなめらかに変えるのは `Collapse`、開閉の記憶は `useFold` / `useFolds`。
- そのほか: コピーは `CopyButton`（文は `text`、画像などは `copy`）、AI の返答の書式付きコピーは `lib/richCopy.ts` の `copyRich`、状態の点は `StatusDot`（接続・準備は `tone`（`toneOf`）、列・チャットの状態は `color`。点を `<span>` で手書きしない）、CLI の状態は `StatusCard` / `GitHubStatusCard`、Markdown は `Markdown`（Mermaid のコードブロックは図にする `MermaidDiagram`。生成中は `streaming` で書きかけの図を描かない。図を書く側が塗り（`style` の `fill`・`classDef`・シーケンス図の `rect` / `box`）や文字色（`linkStyle` の `color`）だけを指定すると、テーマの色と重なって読めなくなるので、描いた後に `fixLabelContrast` が図の種類によらず文字ごとに下の色との明暗差を測り、足りなければ読める色に替える）、コードの色付けは `useHighlight` ＋ `CodeLine`（言語の名前を渡す。ファイルなら `lib/languages.ts` の `languageOf(パス)`。Shiki は使うときだけ読み込む。行を改行でつないで出すだけなら `HighlightedCode`（`lang` が undefined なら色を付けない）。シェル（`shellscript`）の heredoc の本文は、`lib/heredoc.ts` が言語を推し量れればその言語で色を付け直す。短いコードの結果は `highlightLines` が覚えて共有するので、返った配列は書き換えない）、画像を大きく見るのは `ImageViewer`（下）。

### 画像を大きく見る（`ui/imageViewer/`）

アプリの中で開く（外のブラウザには Kickoff のログインがないので、添付を外で開かない。画像以外の添付はアプリの中でダウンロード）。拡大・縮小（＋ / −・ピンチ・⌘+ / ⌘- / ⌘0）・ドラッグで移動・画面に合わせる ⇔ 100%・コピー・保存ができる（計算は純粋関数の `imageZoom.ts`）。何枚もあるときは `images` と `index` で渡し、← / → で前後へ。画像以外を大きく見せるときは children、見出しのボタンは actions（Mermaid の図の全画面）。見出し `ViewerHead` は名前を左・操作を右に、役割ごとのまとまり（`.image-viewer-tools`・`.image-viewer-close`）を区切り線で分ける。ボタンは 28px・アイコンは 16px（にじまないよう偶数の大きさ・整数の位置に）。開いた直後はダイアログ自体にピントを置く。

## 表示の決まり

- 文言をそろえる: 名前のないチャットは「Untitled Chat」（`chatTitle`。定数はコアと共有の `@shared/types` の `UNTITLED_CHAT_TITLE`）、送る前の新しいチャット（下書き）の名前は「New Chat」（`NEW_CHAT_TITLE`。「新しいチャット」のボタン・メニューの文はそのまま）、グループに入っていないチャットのまとまりは「No Group」（`NO_GROUP_LABEL`。どちらも名前として見せるので、英語の単語の頭を大文字に）、画面の読み込みは「読み込み中…」、使用枠の取得は「取得中…」、ログイン状態の確認は「確認中…」、保存は「保存中…」→「保存しました」。
- 新しいチャットの入力欄には、どんな場合も、あらかじめ文を入れない（最初のチャットでも。案内は placeholder で出す）。
- 失敗の文は 12px（`ErrorText`）。
- 状態の色: 使える = 緑 `--ok`、使えない = 赤 `--ng`、確認中 = 黄 `--warn`、対応予定 = 薄い灰 `--extra-muted`。
- 使用率の段階: 70% から注意、90% から警告（`usageLevel`）。数値のない枠（まだ始まっていない）は灰色。
- 未読は「最新の結果をまだ一番下まで見ていない」こと（`chats.unread`。カンバンの列・数・⌘⇧A・サイドバーで「未読」、見たものは「既読」。終わったかより、結果を見たかで分ける）。決まりは `features/chat/CLAUDE.md`。
- 閉じるボタンのアイコンの大きさ: ポップオーバー 14、パネル 15、ダイアログ 16。
- アーカイブする・アーカイブから戻すは、どこから押しても必ず確認ダイアログを出す（チャットは `features/chat/chatActions.ts` の `toggleArchiveChat` / `confirmArchiveChats`、プロジェクトは `features/project/projectOrder.ts` の `confirmArchiveProject` / `confirmRestoreProject`）。確かめずにアーカイブするボタンは置かない。
- 操作は、いつも出すか右クリックのメニューに入れる。マウスを乗せたときだけ出すのは、たくさん並ぶ一覧の行の操作で、いつも出すと一覧が埋まるときに限る（いまはサイドバーのチャットの行の「…」）。そのときも同じ操作を右クリックのメニューに置く。状態（固定しているかなど）は、出す・隠すで分けず、見た目（色・塗り）で分ける。
- アイコンだけの操作には必ず名前を付ける（`IconButton` の `label`）。選択肢の組は radiogroup / radio と aria-checked（`Segmented`）、開閉は aria-expanded。
- 送る前の確かめでやめたら、`Composer` の `onSend` で `SendCancelled` を投げる（書いた文を残し、失敗の文も出さない）。

## 性能

- 作業中は返答が細切れに届くたびにチャットの流れが描き直されるので、流れの項目は memo する（`Timeline.tsx` の `MemoEventItem` / `MemoToolGroup`）。項目に渡す関数は `useCallback` で同じものにし、記録をたどる計算（`collectSubagents` など）は `useMemo` に入れる。context の値は描き直しのたびに作り直さない（チャットの画面の操作 `ChatPaneActions` はチャットごとに 1 回だけ作る。作り直すと memo した項目がすべて描き直される）。
- 書いている途中の返答（SSE の `chat_delta`）は 1 フレームの分をまとめて足す（`useChatDetail`）。
- 長い一覧は描く範囲を絞る（チャットの流れは最近の項目だけを描く窓 `timelineWindow.ts`。流れをすべて描かない。数千ターンのチャットで画面の要素が 10 万個を超え、画面が真っ黒になったことがある）。
- 入力欄の高さは CSS の `field-sizing: content` で伸ばす。JS で高さを auto に戻して `scrollHeight` を測らない（キーを押すたびにページ全体のレイアウトをやり直させ、長いチャットで文字入力が遅くなった）。
- 店の値・まとまりの結果は、中身が同じなら同じ配列・オブジェクトを返す（`useChats` の見え方ごとの配列、`useSetting` の値など）。memo の依存に使えるようにするため。
