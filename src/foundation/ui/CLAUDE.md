# 画面の土台（`src/foundation/ui`）

機能の言葉を持たない画面の部品と仕組み。2 つ以上の機能が使い、機能の型・クラス名を持たないものだけを置く。機能のものは `src/features/<機能>/ui`、CSS は `styles/CLAUDE.md`、App・起動・下の帯は `@/app/renderer/`。

## 口の一覧
- `store/`: `createStore`・`createKeyedStore`・`createCell`・`createSignal`・`createRegistry`・`useController`（店はこれだけ）
- `query/`: `useQuery`（1 つの部品だけが読む値）。`api/`: `client(contract)`（機能の呼び手は各機能の `ui/api.ts`・`ui/api/`。束ねない）・`serverApi`（接続の状態）・SSE の接続 `useServerConnection`・`useServerEvent` / `onServerEvent`
- `storage/`: `defineSettings(機能, {…})`（各機能の `ui/storage.ts`）・`useSetting`・`readSetting` / `writeSetting`
- `navigation/`: ルーター `router.ts`（`useRoute`）・開く口 `open.ts`・別ウィンドウ `popout.ts`・ウィンドウ間の知らせ `windowBus.ts`・履歴 `navigationHistory.ts`
- `points.ts`: 拡張点 `definePoint`（入れるのは `@/app/renderer/registry.ts` だけ。部品は `lazyPart`）
- `kit/`: `IconButton`・`Popover`・`PopupMenu`・`ask.ts`・`Dialog`・`Field` ほか・`StatusDot`・`Markdown`・`dragGhost.ts`・`drag/`・`tabs/`・`usePageFind`・アイコン `icons.ts`
- `hooks/`: `useWindowEvent`・`useLatest`・`useSizeObserver`・`useNearViewport`・`useAction`・`useRovingList`・`useTree`・`useDragSize`・`useOverflowCompact`・`useTicker`・`useCodeMirror`
- `lib/`（`keys.ts`・`time.ts`・`textFind.ts`）・`document/`（`useDocument`）・`workplace/`（ワークツリーの口 `worktreeSource`・ファイルの一覧 `workplaceFiles` は持ち主の機能が登録）・`external/`・`code/`・`markdown/`・`diff/`・`theme/`・`shell/`（`appHosts`・`openAppDialog`・`footerItems`）・`testing/`

## 決まり
- 土台は機能・`app` を読まない。機能のものが要るときは拡張点か引数で受ける。
- サーバーのデータは店に 1 つずつ持つ（部品ごとに取り直さない・props で 3 段以上中継しない）。操作の応答で届いた値は `set` / `update` で入れる。失敗は `ApiError` のまま返す。
- 保存は `defineSettings` で宣言したキーだけ（`kickoff:<機能>:<名前>`。宣言していないキーは起動で消える）。部品にキーの文字列を書かない。ID を含むものは `ids: true`。値の形を変えたら読む側（`public/boot.js` など）も同じコミットで直す。
- window のイベントは `useWindowEvent`、大きさは `useSizeObserver`（要素ごとに Observer を作らない）、時刻は `lib/time.ts`（`toLocaleTimeString` を直に呼ばない）、例外の文は `errorMessage`。
- 浮かぶもの・メニュー・ダイアログ・タブの列・木・並べ替えは `kit` を使う（骨組みを手書きしない）。説明は `data-tip`（title と重ねない）。空の画面は `EmptyState`（なぜ空かと次にできること）。
- アイコンだけの操作には名前を付ける（`IconButton` の `label`）。選択肢の組は radiogroup、開閉は aria-expanded。同じ意味には同じ lucide のアイコン（表は `kit/icons.ts`）。
- アーカイブする・戻すは、どこから押しても確認ダイアログを出す。操作はいつも出すか右クリックに入れる。状態は出す・隠すでなく見た目で分ける。新しいチャットの入力欄に文をあらかじめ入れない。
- 変換を確定する Enter・やめる Esc を操作に使わない（`isComposing`）。ショートカットは `commands.item`（`matchKey` は Mac で ⌘ だけ）。
- 外で開く・外部リンクは `external` を通す（警告に当たるリンクは覚えたドメインでも毎回確かめる）。
- 手書きの `useMemo`・`useCallback`・`memo` は書かない（残すなら `// 残す: 理由`）。

## 落とし穴
- `public/boot.js` は保存の読み方・骨組みの色と高さを写す。変えたら `@/app/renderer/bootScript.test.ts` を通す。
- React Compiler: 描く中で ref・外の値（`readSetting`・モジュールの変数）を読み書きしない。effect の依存を抑止コメントで減らさない（`useEffectEvent`）。hook が返した ref は分けて受ける。外すのは `"use no memo"` と理由と `react-compiler-skips.json` の 3 つが揃うときだけ（ないとビルドが落ちる）。
- 裏のタブは `Activity` の hidden で止める。隠すと effect が流れ直すので、外の値は `useSyncExternalStore` で読み、隠しても続ける仕事は殻に置く。
- memo した部品・`Markdown` へ描くたびに新しい値を渡さない。店の値は中身が同じなら同じ参照を返す。速く変わる値（書いている途中の返答）は state に入れない。
- 長い一覧は窓か段階に分けて描く。行の DOM を読む操作の前に `ensureAllRows()`。`content-visibility` で省いた行の中の位置を読まない。
- ドラッグ中の見た目を変える state は `startDragGhost` の `after` で変える（`dragstart` の中で描き直すとドラッグが取り消される）。端のスクロールは `dragAutoScroll.ts` が全部に効かせる。
- 戻る・進むは画面単位の履歴（`useHashRoute` が描く前に積む。たどるときは `replace`）。動けない方向は無効にする。
- ページの ⌘F は `kit/usePageFind`（ページの要素は `position: relative`。エディタの検索に任せるなら `native`）。チャットの中の検索は捕捉で先に受ける。
- 重いもの（Mermaid・図・色付け）は `useNearViewport` で手前まで来てから。色付けは Web Worker。
- テスト: `store/*.test.ts`・`storage/*.test.ts`・`navigation/*.test.ts`。偽の時計は `@shared/foundation/testing` の `createFakeScheduler`。
