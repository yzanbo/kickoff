# ゴミ箱（`features/trash`）
<!-- 行き先: src/features/trash/ -->

Kickoff のゴミ箱（消したものを 3 日取っておき、元に戻せる。OS のゴミ箱とは別）の画面。コアは `src/core/CLAUDE.md` の「ゴミ箱」。

## 地図
<!-- 行き先: src/features/trash/ -->

| ファイル | 中身 |
|---|---|
| `stores/trash.ts`・`api/trash.ts` | 一覧の店（プロジェクトごと・ゴミ箱のプロジェクト・どこにも出ないもの）・API |
| `TrashTab.tsx` | プロジェクトの「ゴミ箱」タブ（行 `TrashRow` は設定と共通） |
| `TrashSettings.tsx`・`OrphanSessions.tsx` | 設定の「ゴミ箱と整理」 |
| `TrashMarkRows.tsx` | コマンドの出力の下の［元に戻す］（印の読み方は `@shared/trash/marks`） |
| `trashActions.ts` | 戻す・完全に消す・消した直後の知らせ `showTrashedToast` |
| `trashText.ts` | 残り時間・完全に消す確認の文（テストは隣） |

## 決まり
<!-- 行き先: src/features/trash/ -->

- 消す操作をした領域は `showTrashedToast` で知らせる（ファイル・メモ・チャット・プロジェクト）。
- 戻すとき、元の場所に同じ名前があれば上書きしない（別の名前で戻すかを聞く）。
- 完全に消す操作は必ず確認のダイアログを出す（取り消せない）。まとめて消すのは、確かめたときに並んでいた ID だけ。

## 落とし穴
<!-- 行き先: src/features/trash/ -->

- AI の kickoff-trash は画面を通らずに入れ、コアが一覧を読むときに取り込む。店は SSE `trash` と窓に戻ったときに取り直す。
- 会話の中の行は、呼び出しを開いたときに 1 回だけゴミ箱にあるかを聞く（閉じたままでは聞かない）。
- 使っていない会話記録はターミナルで使った Claude Code の分も出るので、自動では入れない（選んで確かめてから）。
