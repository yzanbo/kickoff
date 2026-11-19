# ターミナル・埋め込みブラウザ・外で開く（`features/terminal`・`browser`・`openWith`）

パネルのタブの中身。メインプロセスの側は `src/main/CLAUDE.md`。

## ターミナル（`features/terminal`）
<!-- 行き先: src/features/terminal/ -->

- シェルはコアで動き、画面はスマホと同じコアの API でつなぐ（`api/terminals.ts`。`src/core/CLAUDE.md` の「ターミナル」）。
- タブを別ウィンドウへ移す・戻すときは、受け取った側が `claimTerminal` で持ち主になってから渡した側を閉じる。
- つなぐまでの出力は最初の snapshot に入っているので捨てる。画面に出す注意も snapshot に入れる。
- ⌘ のないキーはシェルのもの（ショートカット・Esc に渡さない）。つなぐたびに `meta`（持ち主・名前）を知らせる（AI が名前で示す）。

## 埋め込みブラウザ（`features/browser`）
<!-- 行き先: src/features/browser/ -->

- ページは本体と切り離したセッション（`persist:kickoff-browser`。メインでも強制）。入力欄の文は検索・チャットに渡さない。
- 開発者ツールの重ねた表示は HTML より上に描く。メニュー・ダイアログが重なる間は撮った絵に替える（`devtoolsBox.ts`）。
- AI が使うタブは作業ごとに初めの 1 回だけ表に出す（`core/mcp/browserReveal.ts`）。キーボードのピントは動かさない。

## 外部リンク（`browser/linkOpen.ts`）
<!-- 行き先: src/foundation/ui/ -->

- Markdown の外部リンクは開く前に確かめる（`openWebLink`）。警告に当たるリンクは覚えたドメインでも毎回確かめる。

## 外のアプリで開く（`features/openWith`）
<!-- 行き先: src/features/panel/ -->

- 開く場所は `terminalTargetOf` 1 つで決める。チャットの見出しに外部のターミナルのボタンを置かない（パネルの ▾ に集める）。
