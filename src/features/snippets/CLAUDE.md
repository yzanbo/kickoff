# 定型文（`src/features/snippets`）

よく送る指示を、チャット欄の上の帯（`SnippetBar`）から入力欄に入れる・送る。

| ファイル | 中身 |
|---|---|
| `ui/stores/snippets.ts`・`snippetActions.ts` | 店（すべてを 1 つで読む）・作る / 直す / 並べ替える / 消す |
| `ui/api.ts` | 呼び手 `client(snippetContract)`（画面を取り決めに乗せ替えた見本） |
| `ui/SnippetManager`・`SnippetForm` | 管理（帯のダイアログ・設定・プロジェクトの設定で同じ部品） |
| `core/routes.ts`・`schemas.ts` | 受け口（取り決め `@shared/snippets/contract.ts` の見本。プロジェクトは `projects.api.require`） |

- 範囲は行ごと（`project_id` が `null` なら共通）。チャットの一覧は `snippetsFor`（そのプロジェクト ＋ 共通）。
- 操作の応答は店に入れ、知らせを待たない。並べ替えは見えている行だけを動かす（`moveWithin`）。
- 帯を出すかは `snippets:bar-hidden` 1 つ（どこで切り替えても同じ値）。ダイアログは背景を押しても閉じない。
