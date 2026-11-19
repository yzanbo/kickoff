# 定型文（`features/snippet/`）
<!-- 行き先: src/features/snippets/ -->

よく送る指示を、チャット欄の上の帯（`SnippetBar`）から入力欄に入れる・送る。

| ファイル | 中身 |
|---|---|
| `stores/snippets.ts`・`snippetActions.ts` | 店（すべてを 1 つで読む）・作る / 直す / 並べ替える / 消す |
| `SnippetManager`・`SnippetForm` | 管理（帯のダイアログ・設定・プロジェクトの設定で同じ部品） |

- 範囲は行ごと（`project_id` が `null` なら共通）。チャットの一覧は `snippetsFor`（そのプロジェクト ＋ 共通）。
- 操作の応答は店に入れ、知らせを待たない。並べ替えは見えている行だけを動かす（`moveWithin`）。
- 帯を出すかは `SNIPPET_BAR_HIDDEN` 1 つ（どこで切り替えても同じ値）。ダイアログは背景を押しても閉じない。

## 圧縮前指示・圧縮後指示（`CompactPrompt*`・`useCompactPrompt.ts`）
<!-- 行き先: src/features/compact/ -->

- 種類の名前とアイコンは `COMPACT_PROMPT_KINDS`、保存する項目は `@shared/chat/prompts` の `COMPACT_PROMPT_FIELDS`。
- 見せる文はコアと同じ `compactPromptFor`。送る順はコア（`src/core/chat/CLAUDE.md` の「圧縮と、圧縮前・圧縮後の指示」）。
- オン / オフは文と別にすぐ保存する（オフでも文は残す）。
