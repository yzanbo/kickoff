# 定型文（`features/snippet/`）

よく送る指示を定型文として持ち、チャット欄の中の上の帯から押すだけで入力欄に入れる・送る。

## データ

- 1 つの一覧（表 `snippets`・型 `Snippet`）で、行ごとに範囲を持つ: `project_id` が `null` なら共通（すべてのプロジェクト）、番号ならそのプロジェクトだけ。範囲は後から切り替えられる。プロジェクトを消すと、そのプロジェクトだけのものも消える。
- 名前（`label`）は省ける。省いたら本文の 1 行目を名前として見せる（`@shared/snippet/snippets` の `snippetLabel`）。並びは全体で 1 本の `position`（`bySnippetPosition`）。
- 店は `stores/snippets.ts` の 1 つ（すべてを読む。SSE の `snippet` / `snippet_deleted` で直す）。チャットで使うものは `useProjectSnippets(projectId)`（このプロジェクトだけのもの ＋ 共通。`snippetsFor`）、設定のすべては `useAllSnippets`。
- 作る・直す・並べ替える・消すは `snippetActions.ts`（応答の値を店に入れて、知らせを待たずにそろえる。消すときは `confirmDeleteSnippet` で確かめる）。並べ替えは見えている行だけを動かし、ほかの行の位置は変えない（`moveWithin`）。

## 帯（`SnippetBar`）

- 置き場所はチャット欄（入力欄）の枠の中のいちばん上。送信待ちがあれば、送信待ちと入力欄の間の区切り線の下に入る（`features/chat/pane/ChatComposerArea.tsx` が `Composer` の `header` に渡す。文を書く欄はそのすぐ下）。
- ピルを横に並べ、入りきらなければ横にスクロールする（`useHorizontalScroller`。縦のホイールも横に動かす。端の先に続きがあれば `fade-start` / `fade-end` で薄くぼかす。スクロールバーは出さない）。ピルは名前を省略して出し、乗せると本文（400 文字まで）を出す。
- ピルを押すと入力欄のキャレットの位置に入れる（`ComposerHandle.insert`。書いている文は残す）。⌘クリック・右クリックの「すぐ送る」は、入力欄はそのままでその定型文だけを送る（作業中・送信待ちがあれば送信待ちに足す。送る処理は `ChatComposerArea` の `sendSnippet`）。送る前の確かめでやめた（`SendCancelled`）なら失敗の文を出さない。
- 右に「定型文の一覧」（`SnippetPicker`）と「定型文を管理」（`SnippetDialog`）のボタン。定型文がなければピルの代わりに「定型文を追加」。
- 右クリック: ピルの上なら、入力欄に入れる・すぐ送る・編集…・削除。どこでも、定型文を追加・定型文を管理…・定型文の帯を隠す。
- 帯を出すかは `SNIPPET_BAR_HIDDEN`（帯の右クリック・タブの列の「表示」→「定型文の帯」・設定の「表示」→「定型文の帯」で共通。どのチャットでも同じ）。

## 一覧（`SnippetPicker`）

帯は横に流れて一度に見えないので、このプロジェクトで使うものを縦に並べる `Popover`。名前と本文で絞り込み、↑↓ で選んで Enter で入れる・⌘Enter で送る（行は押す = 入れる・⌘クリック = 送る）。行に範囲の札（共通 / プロジェクト名）。下に「追加」「定型文を管理」。

## 管理（`SnippetManager` ＋ `SnippetForm`）

- 足す・直す・範囲を変える・並べ替える（↑↓）・消す。同じ部品を、帯のダイアログ（`SnippetDialog`。このプロジェクトのもの）・設定の「定型文」（すべて）・プロジェクトの設定の「定型文」（そのプロジェクトのもの）で使う（`SnippetSettings`）。
- フォームは 1 つずつ開く（`SnippetEditing`: 直す行の ID / `"new"` / `null`）。⌘Enter で保存、Esc はまずフォームだけをやめる（ダイアログは閉じない）。範囲の選択肢（共通 ＋ 選べるプロジェクト。チャットとプロジェクトの設定ではそのプロジェクトだけ、アプリの設定ではすべて）が 3 つまでなら `Segmented`、それより多ければ select。
- ダイアログは背景を押しても閉じない（書きかけを消さないため）。下の「すべての定型文を設定で見る」で設定の「定型文」を開く（`openSettings("snippets")`）。

## 圧縮前指示（`PreCompactPromptForm`・`PreCompactPromptEditor`）

設定の「定型文」とプロジェクトの設定の「定型文」で、定型文の一覧の下に置く欄（帯のダイアログには出さない）。同じ値をチャット欄のメーターの詳細（`features/chat/composer/ContextMeter.tsx`）の「圧縮前指示」（`PreCompactPromptEditor`）でも書ける: 開閉の行（初めは閉じる。開いているかは `useFold("composer", "pre-compact")` で覚える）に、いま送る指示の範囲（共通 ＋ プロジェクト名 / 共通 / プロジェクト名 / なし）を添え、開くと共通 / プロジェクト（ボタンはプロジェクト名。長ければ省略）を `Segmented` で切り替えて書く（両方の書きかけを持ち、切り替えても消さない）。書きかけと保存はどちらも `usePreCompactPrompt(projectId | null)`（保存した・ほかで変わったら書きかけを合わせる）。会話を圧縮する前に AI に送る指示で、設定は共通の分（`AppSettings.pre_compact_prompt`）、プロジェクトはそのプロジェクトの分（`Project.pre_compact_prompt`）。送るときは共通 → プロジェクトの順につなぐ。空にすると null で保存して送らない。手で圧縮するときは先に送ってから圧縮し、自動の圧縮でも圧縮を待たせて済ませてもらう（コア。`src/core/chat/CLAUDE.md`）。送った指示は会話に「圧縮前指示」の札付きの自分の発言として残る（`features/chat/CLAUDE.md` の「発言」）。
