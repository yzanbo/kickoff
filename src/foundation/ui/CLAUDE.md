# 画面の土台（`src/foundation/ui`）

画面全体の決まり（置き場所・データ・保存・API・共有部品・表示・性能）。機能ごとは `src/features/<機能>/CLAUDE.md`、CSS は `styles/CLAUDE.md`。

## フォルダと依存の向き

| フォルダ | 役割 |
|---|---|
| `kit/`・`hooks/`・`lib/` | ドメインを知らない部品・hooks・React に依存しない補助（時刻 `time.ts`・キー `keys.ts`・色付けなど） |
| `store/`・`api/`・`storage/` | 店の仕組み（下の「データ」）・サーバーとのやり取り（下の「API」）・表示の設定の保存 |
| `navigation/`・`shell/` | ルーター `router.ts`・別ウィンドウ `popout.ts`・ウィンドウの間の知らせ `windowBus.ts`・移動の履歴 / アプリの殻の土台 |
| `workplace/`・`code/`・`markdown/`・`diff/`・`external/`・`theme/`・`ansi/` | 作業場所・コード・Markdown・差分・外で開く・テーマ・ANSI の色 |

App・起動・ショートカット・下の帯は `src/app/renderer/`、機能の画面は `src/features/<機能>/ui/`。

- 依存の向きはルートの `CLAUDE.md` の「層と依存の向き」。土台は機能を読まない。
- import は同じフォルダなら `./`、それ以外は `@/…`、プロセスをまたぐものは `@shared/…`。`../` でたどらない。
- 複数のファイルになる機能は `src/features/<機能>/` にまとめる。どの機能にも属さないものだけを土台に置く。
- 大きな部品は「状態と操作の hook（`useXxx`）」と「描く部品」に分ける（`usePanel` ＋ `Panel`）。props の束も hook から返してよい。
- 画面（ルート。`navigation/router.ts` の `Route`）を増やす前に、ダイアログか右のパネルで足りないか考える。

## データ（`store/` と全体の context）

- サーバーのデータは店に 1 つずつ持つ。部品ごとに取り直さない・props で 3 段以上中継しない。
- 店は `createStore` / `createKeyedStore`、外の 1 つの値は `createCell`・知らせ `createSignal`・登録表 `createRegistry`（Set を手で持たない）。閉じた所は `active: false`。
- プロジェクトの名前は `useProjects()` の `projectName(id)`（`projects.find(…)` を書かない）。領域だけのデータは、その領域で店を作ってよい。
- 開いているチャットの中身はチャットの店（`src/features/conversation/CLAUDE.md` の「1 つのチャットの画面」）。部品は要る口だけを読む。
- 操作の応答で届いた値は `set` / `update` で入れ、知らせを待たずに画面をそろえる（`addProject`・`addChat`）。
- 回答待ちは App が 1 回引き当てて `useChatStates()` で配る（部品で `api.approvals()` を呼ばない）。
- いまのルートは `useRoute()`。前回の画面は `main.tsx` が App を描く前に `restoreLastRoute` で開く（一度きりの指定は `lastingRoute` で外す）。

## 表示の設定の保存（`storage/settings.ts`・`storage/storageKeys.ts`）

- localStorage / sessionStorage に残すものは `storage/storageKeys.ts` でだけ宣言する。宣言していない `kickoff:` のキーは起動したときに消える。
- 読み書きは `useSetting` / `useOptionalSetting`、React の外は `readSetting` / `writeSetting`。部品にキーの文字列を書かない・直接読み書きしない。
- キー名と保存する値は変えない（利用者の表示の好みを残すため）。選択肢を増やすときも、今までの値はそのままの意味で読めるようにする。
- ID をキーか値に含むものは `ids: true`（`prepareStorage` が、DB を作り直していれば App を描く前に捨てる）。
- localStorage は別ウィンドウと共有（sessionStorage はウィンドウごと）。まとまりの開閉は `FOLDS` 1 つ（`src/features/chatList/CLAUDE.md`）。

## API（`api/`）

- 通信の土台は `api/http.ts` だけ。資源ごとの関数は各機能の `ui/api/<資源>.ts`（コアの `core/routes/<資源>.ts` と対応）に書き、`api/index.ts` で 1 つにまとめる。
- 名前が重なると後のもので上書きされるので、重ならないことを `index.test.ts` で確かめる。型は機能の取り決めから。
- SSE は App が 1 回つなぎ、`api/events.ts` が種類ごとに配る（`useServerEvent`・`onServerEvent`）。

## hooks と補助

- window のイベントは `useWindowEvent`（effect の中で `addEventListener` しない。先に受け取るなら `capture`）。最新の値を読む ref は `useLatest`。
- テーマは `useAppliedTheme`、窓の前後は `useWindowFocused`、ネットワークは `useOnline`。
- 大きさの見張りは `useSizeObserver`、画面に入ったかは `useNearViewport` / `useWhenVisible`（要素ごとに Observer を作らない）。
- 店にないものを読むのは `useAsync` / `useKeyedAsync`。操作の実行中と失敗は `useAction`・`useSave`・`useSubmit`。
- 知らせは `reportFailure`（失敗のお知らせ）・`showToast`（済んだ操作）・`showDropHint`（落とせない理由）。
- キーの判定は `lib/keys.ts`。変換を確定する Enter・やめる Esc を操作に使わない（`isComposing`）。書き直しの欄は `useEditKeys`。
- アプリのショートカットは Mac では ⌘ だけで受け、Control 付き（入力欄の編集のキー）を同じ操作にしない。
- 選ぶ: ↑↓ は `stepIndex` / `useListNavigation`、複数選択は `useMultiSelect`。
- 大きさ: つまみは `useDragSize`、狭いときに 1 つずつ出すのは `useNarrowSplit`、覆う右の欄は `useCoverableWidth`。
- あふれたら詰めるのは `useOverflowCompact` / `useWrapCompact`（決め打ちの幅で切り替えない）。付いていくスクロールは `useFollowScroll`。
- 編集の部品は `hooks/useCodeMirror`（部品ごとに `new EditorView` を組み立てない）。
- ⌘⇧S（すべて保存）は、開いている文書が `lib/saveAll.ts` の `registerSavable` で知らせる。
- 例外の文は `errorMessage`、class 名は `cx`、トークン数は `formatTokens`、パスは `splitPath` ＋ `PathParts`。
- 時刻は `lib/time.ts`（部品で `toLocaleTimeString` などを直に呼ばない）。時間で変わる表示は `useTicker`。

## 共有部品（`kit/`。手書きしない）

- アイコンだけのボタンは `IconButton` / `CloseButton` / `RefreshButton`（`label` が名前と説明）。`<button className="icon-button">` を手で書かない。
- マウスを乗せたときの説明は `data-tip`（`data-tip-title`・`data-tip-keys`・`data-tip-side`）。App の `HoverTip` が出す。title と重ねない。
- 押すと開く一覧は `Popover` ＋ `usePopover`、外側のクリックと Esc で閉じるのは `useDismiss`。
- メニューは `PopupMenu` ＋ `MenuItem`（子は `useSubmenu` ＋ `MenuFlyout`、開閉は `useContextMenu`）。呼ぶ側で大きさを見積もらない。
- `useMenuKeys` は `PopupMenu` が効かせるので重ねて呼ばない。1 つ選ぶのは `ChoiceMenu` / `ChipPicker`、チャット欄は `OptionMenu`。
- ダイアログは `kit/dialogs.tsx`（確認・入力・選択と、チェックを添える形）。モーダルは `useModalDialog`、ボタンの行は `DialogActions`。
- フォームは `Field`・`CheckField`・`SearchField`・`InlineName`・`CommitInput`、失敗の文は `ErrorText`、結果は `ResultMessage`。
- 左の一覧の開閉は `kit/ListRail.tsx`。左の一覧がある画面は、どれも隠せるようにする。
- 空の画面は `EmptyState`。文 1 行で済ませず、なぜ空かと次にできることを出す。
- 1 つを選ぶ組は `Segmented`、オン・オフの組は `ToggleButtons`。開くまで中身を作らない `<details>` は `LazyDetails`（閉じた中身を要素で渡さない）。
- 開閉は `FoldHead` / `FoldSection`・`Chevron`・`Collapse`・`useFold`。いちばん下の「アーカイブ済み n」は `ArchivedFold`。
- 中身のないまとまりは開いても閉じても同じ高さにする（空の入れ物を置かないか `:empty` で隠す）。
- ドラッグできる物は、どれも `dragstart` で `kit/dragGhost.ts` の `startDragGhost` を呼ぶ（例外はパネルのタブ）。ビューのタブは `useViewTabDrag`。
- ドラッグ中の見た目を変える state は `startDragGhost` の `after` で変える（`dragstart` の中で描き直すと、ドラッグが取り消される）。
- ドラッグ中の端のスクロールは `lib/dragAutoScroll.ts` がすべてのドラッグに効かせるので、部品ごとに書かない。
- 状態の点は `StatusDot`（`<span>` で手書きしない）、札は `ToneChip`。
- Markdown は `Markdown`（Mermaid・数式も。画像とリンクの差し込み口は `markdownImages.ts` / `markdownLinks.ts`）。
- コードの色付けは `useHighlight` ＋ `CodeLine` / `HighlightedCode`（返った配列は覚えて共有するので書き換えない）。
- 画像を大きく見るのは `kit/imageViewer/`（添付を外のブラウザで開かない）。

### ページの ⌘F

- ページの要素に `kit/usePageFind` を置く（`kit/pageFind.ts`。アプリの ⌘F が開く）。ページの要素は `position: relative` にする。
- `native` でページの中のエディタの検索に任せ、任せられなければ `kit/FindBar`。検索の欄はどこでも `kit/FindField`、探し方は `hooks/useFindOptions`。
- チャットの中の検索は、捕捉でこれより先に受け取る。

## 表示の決まり

- 名前の文言は定数（`UNTITLED_CHAT_TITLE`・`NEW_CHAT_TITLE`・`NO_GROUP_LABEL`）。状態の色は `--ok` / `--ng` / `--warn` / `--extra-muted`。
- 新しいチャットの入力欄に、どんな場合もあらかじめ文を入れない（案内は placeholder）。
- アーカイブする・戻すは、どこから押しても必ず確認ダイアログを出す（`chatActions.ts`・`projectOrder.ts` の確認の関数）。
- 操作はいつも出すか右クリックに入れる。乗せたときだけ出すのは、いつも出すと一覧が埋まる行だけ（そのときも右クリックに置く）。
- 状態（固定しているかなど）は出す・隠すで分けず、見た目（色・塗り）で分ける。
- アイコンだけの操作には必ず名前を付ける。選択肢の組は radiogroup / radio と aria-checked、開閉は aria-expanded。
- 送る前の確かめでやめたら、`Composer` の `onSend` で `SendCancelled` を投げる（書いた文を残す）。
- 同じ意味には、どこでも同じ lucide のアイコンを使う（置く前に、同じ意味のものを探す）。いまの決まり:
  - 新しいチャット `SquarePen`・子チャットを作る `MessageSquarePlus`・チャット `MessageSquare`・子チャット `MessagesSquare`
  - 送る `SendHorizontal`・親チャットに渡す `Inbox`・添付 `Paperclip`・チャットに足す `AddToChat`（`kit/icons.ts`）
  - 固定 `Pin`・「…」 `Ellipsis`・取り直す `RefreshCw`・やり直す `RotateCcw`・作業場所 `GitBranch`・変更 `FileDiff`
  - 外で開く `ExternalLink`・ソース `CodeXml`・設定 `Settings`・タグ `Tag`・外す `X`（消すは `Trash2`）・欄の開閉は向きのあるもの

## 性能

測った数は `docs/architecture.md` の「決めたこと（測った数）」。

- 起動直後の骨組み `public/boot.js` は、保存の読み方を `storage/storageKeys.ts`・`theme/theme.ts`・`@/features/sidebar/ui/useSidebar.ts` と同じにする。
- それらの読み方・骨組みの色と高さ（`styles/`）を変えたら `boot.js` も直す（`@/app/renderer/bootScript.test.ts` が確かめる。テストは `public/` に置かない）。
- 裏のタブのチャットの会話の欄は `Activity` の hidden で止める（`@/features/conversation/ui/screen/ChatScreen.tsx`）。
- 隠すと effect の片付けが、表に戻すと effect が流れ直す。流れ直して困るものは描いている間に決めるか店に置き、隠しても続ける仕事は殻に置く。
- 外の値（窓のフォーカス・つながり）は state に写さず `useSyncExternalStore` で読む（隠している間は購読が外れ、写した値は古いまま）。
- context の値と memo した部品に渡す値は、描くたびに作り直さない（`useMemo` で作り置く。`ChatPaneActions` はチャットごとに 1 回）。
- 流れの項目は memo し、流れ全体に効く値（作業中か）を項目の props で渡さない（使う部品が context で読む。`useTimelineBusy`）。
- 記録をたどる計算は `useMemo` か、チャットの店の取り出し口 `@/features/chat/ui/store/chatSelectors.ts` に置く。
- 書いている途中の返答（`chat_delta`）は React の state に入れない（店の途中の文の口に当て、`useStreamReveal` が rAF で読む）。
- `Markdown` に毎回新しい値（その場で作った配列など）を渡さない。react-markdown の版を上げたら `markdownProcessor.test.ts` を流す。
- 変わる値（ファイルのリンクの一覧など）を Markdown の解析に入れない（すべての返答を解析し直す。`@/features/files/ui/links/fileIndexStore.ts`）。
- 長い一覧は描く範囲を絞る。チャットの流れは窓 `@/features/conversation/ui/timeline/rowWindow/useRowWindow.ts`、サイドバー・ボードは開いた直後だけ段階に分ける（`useProgressiveRows.ts`）。
- 行の DOM を読む操作（キーでの移動・範囲の選択・ドラッグ）では、先に `ensureAllRows()` を呼ぶ（描いている途中・effect の中では呼ばない）。
- 一番下への付いていきは、大きさの知らせの中でずれたときだけ寄せる（`@/features/composer/ui/followScroll.ts`）。effect で `scrollTop = scrollHeight` を書かない。
- `content-visibility: auto` で省いた行の中の位置を読まない（その行のレイアウトを強いる）。流れをたどるときは行の包みの位置で決める。
- 重いもの（Mermaid・AI の図・コードの色付け）は `useNearViewport` で手前まで来てから始める。色付けは Web Worker（`code/highlightPool.ts`）。
- 入力欄の高さは CSS の `field-sizing: content` で伸ばす。JS で `scrollHeight` を測らない。
- `useTicker` は時間で変わる値を出す部品だけで呼ぶ（App・画面全体の hook に置かない）。
- 店の値・まとまりの結果は、中身が同じなら同じ配列・オブジェクトを返す（memo の依存に使えるように）。
- 画面は React Compiler を通す。最適化できなかった部品が `@/app/renderer/react-compiler-skips.json` になければビルドが落ちる。外れない書き方:
  - effect の依存を抑止コメントで減らさない（関数ごと外れる）。変わってもやり直したくない値は `useEffectEvent` で読む。
  - 描く中で ref に書かない・読まない（押したときに読むなら `useLatest`）。描き分けに要る値は state にする。
  - hook が返したオブジェクトの中の ref を `ref={x.ref}` と渡さない（`const { ref, ...rest } = …` と分けて受ける）。
  - 描く中で外の値（`readSetting`・モジュールの変数）を読まない（`useSetting`・`useTicker` で描き直す）。
  - 外すのは、覚えると壊れると確かめた所だけ: 本体の先頭に `"use no memo"` と理由のコメントを書き、許した一覧にも足す。

## 画面の移動の履歴

- 戻る・進む（⌘[ / ⌘]）は画面単位の履歴（`navigation/navigationHistory.ts`）。パネルの開閉・編集・内蔵ブラウザの移動は積まない。
- 履歴は `useHashRoute` が画面を描く前に積む（子の部品が URL を置き換える前の移動を落とさない）。たどるときは `replace` で積み直さない。
- 動けない方向は隠さず無効にする。戻る・進むでは欄の最大表示を解除する。

## アプリの殻（`shell/`・`@/app/renderer/`）

- 全体表示中の共通ヘッダー `MaximizedHeader`（`shell/WindowHeaderContent.tsx`）は、元の画面の名前の行を、既存の 40px の操作行へ移す（複製しない・新しい行を足さない）。
- 下の帯の高さは起動直後の骨組みの `.boot-footer` と同じにする（変えたら `@/app/renderer/bootScript.test.ts` を通す）。接続が切れた札は、つながらないまま少し経ってから出す（`useConnectionNotice`。一瞬の切断でちらつかせない）。

## 外部リンク（`external/linkOpen.ts`）

- Markdown の外部リンクは開く前に確かめる（`openWebLink`）。警告に当たるリンクは覚えたドメインでも毎回確かめる。
