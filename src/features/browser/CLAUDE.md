# 埋め込みブラウザ（`src/features/browser`）

## 地図

- `desktop/`: メインの口（webview の守り `hardenWebviews`・`isOurWebview`・開発者ツール・拡張・AI の操作）。
- `core/`: AI のブラウザのツール（`tools.ts`。最後に使ったタブはチャットごと）・タブを表に出す `browserReveal.ts`・「ブラウザ」の節の contributor（`turnParts.ts`）。
- `ui/`: ブラウザのタブ（`BrowserPane`。種類は `panel/tabKind.ts`・欄 `side`・`win` は `panel/browserSurfaces.ts`）・開く行き先 `openTargets.ts`（`open({ kind: "browser", projectId, url })`）・開発者ツールの重ね `devtoolsBox.ts`。

## 決まり

- ページは信頼しない外部のもの。本体と切り離したセッション（`persist:kickoff-browser`。メインでも強制）で開き、`hardenWebviews` は窓を作る前に登録する。入力欄の文は検索・チャットに渡さない。
- 操作は頼んできた画面の中の webview に限る（`isOurWebview`）。
- AI が使うタブは作業ごとに初めの 1 回だけ表に出す（`core/browserReveal.ts`）。キーボードのピントは動かさない。

## 落とし穴

- 開発者ツールは webview の中に出さず、埋め込みブラウザのセッションの WebContents に出す。どこに出したかは画面が持つ（Electron の知らせは遅れる）。
- 開発者ツールの重ねた表示は HTML より上に描く。メニュー・ダイアログが重なる間は撮った絵に替える（`devtoolsBox.ts`）。
