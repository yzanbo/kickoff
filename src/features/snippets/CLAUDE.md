# 定型文（`features/snippets`）

よく送る指示を定型文として持ち、入力欄の上の帯から入れる・送る。受け入れの一覧: `docs/features.md` の `CHT-`。

## 地図
- `@shared/snippets/contract.ts`: ルート（一覧・作る・直す・並べ替える・消す）と SSE。`snippetsFor`（そのプロジェクト＋すべてのプロジェクト）
- `core/routes.ts`・`schemas.ts`（プロジェクトは `projects.api.require`）・`core/tools.ts`（AI の `add_snippet`。足すだけ）
- `ui/store.ts`（全部を 1 つで読む）・`snippetActions.ts`・`api.ts`（`client(snippetContract)`）
- `ui/SnippetBar`（`composerSlots` の `band`・`menu` に `contributes.ts` が登録）・`SnippetManager`・`SnippetForm`（帯・設定・プロジェクトの設定で同じ部品）・`storage.ts`

## 決まり
- 範囲は行ごと（`project_id` が `null` なら「すべてのプロジェクト」で札は「すべて」、共通の id なら「共通」= 共通のチャットだけ。選択肢と札は `ui/snippetScopes.ts`）。「共通」は共通のチャット・ノートの意味だけに使う。圧縮の前後に自動で送る指示は `features/compact`（ここに置かない）。
- 操作の応答は店に入れ、知らせを待たない。並べ替えは見えている行だけを動かす（`moveWithin`）。
- 帯を出すかは `snippets:bar-hidden` 1 つ（どこで切り替えても同じ値）。ダイアログは背景を押しても閉じない（書きかけを消さない）。

## 落とし穴
- 「すぐ送る」は入力欄の文を残し、定型文だけを composer の送る口で送る（作業中なら送信待ち）。
- テスト: `core/routes.test.ts`・`core/tools.test.ts`・`ui/store.test.ts`・`ui/snippetScopes.test.ts`。
