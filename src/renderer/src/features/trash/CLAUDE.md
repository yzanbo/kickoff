# ゴミ箱（`features/trash`）

Kickoff のゴミ箱（消したものを 3 日取っておき、元に戻せる。OS のゴミ箱とは別）の画面。コアの決まりは `src/core/CLAUDE.md` の「ゴミ箱」、要件はメモの仕様書「開発履歴/0015_【済】ファイル削除/ファイル削除 仕様書」（2026-11-14 に利用者と決めた）。

- データは店の `stores/trash.ts`（プロジェクトごとの一覧 `useProjectTrash`・ゴミ箱のプロジェクト `useTrashedProjects`。SSE の `trash` で取り直す。AI の kickoff-trash で入れたものはコアが一覧を読むときに取り込むので、窓に戻ったときも取り直す）。API は `api/trash.ts`。
- プロジェクトの「ゴミ箱」タブ（`TrashTab`。タブの並びでは独りのまとまり「ゴミ箱」）: 新しい順に、種類のアイコン・名前・元の場所（プロジェクトフォルダの中ならそこからの場所）・誰が消したか（AI ならそのチャットの名前で、押すとそのチャットを開く。画面から消したものは「あなた」）・いつ・大きさ・消えるまでの残り（`trashText.ts` の `remainingText`。`useTicker` で 1 分ごとに描き直す）と「元に戻す」。本当に消す・空にする口は置かない（3 日で消える）。
- 一覧の行（`TrashTab.tsx` の `TrashRow`。設定のプロジェクトのないものと共通）の元の場所は、プロジェクトフォルダの中ならそこからの場所で、名前だけと同じ（いちばん上）なら出さない。
- 元に戻す（`trashActions.ts` の `restoreFromTrash`）: 元の場所に同じ名前があれば上書きせず、「別の名前で戻しますか」を聞いてから `rename` で戻す（「名前 2」）。戻せたら知らせる（別の名前ならその場所も）。失敗はお知らせ。
- 消した直後の知らせ（`showTrashedToast`）: ファイル・メモ・チャット・プロジェクトを消したら「「名前」をゴミ箱に入れました（3 日は元に戻せます）」と［元に戻す］（`ui/toast`）。いくつもまとめて消したときは数だけの知らせ（戻すのはタブから）。呼ぶのは各領域の削除の操作（`features/chat/chatActions.ts`・`closeChat.ts`・`features/editor/useFileActions.tsx`・`features/memo/useMemoActions.ts`・`features/project/settings/DeleteProject.tsx`）。
- 会話の中の「元に戻す」（`TrashMarkRows`）: コマンドの出力（`features/chat/tools/BashOutput.tsx`）に kickoff-trash の印（「Kickoff のゴミ箱に入れました…: <元の場所> [kickoff-trash:<id>]」。読み方は `@shared/trash/marks` の `trashMarksIn`）があれば、出力の下に 1 件ずつ元の場所と［元に戻す］を並べる。まだゴミ箱にあるかは、その呼び出しを開いたときに 1 回だけ `api.trashItem` で聞き（閉じたままの呼び出しでは聞かない）、あれば残り、なければ「もうゴミ箱にありません」で押せなくする。戻したら「戻しました」。
- 設定の「ゴミ箱と整理」（`TrashSettings`）: ゴミ箱のプロジェクト（プロジェクトの「ゴミ箱」タブはプロジェクトの中にあるので、プロジェクトごと消したものはここで戻す。プロジェクトの切り替えのメニューのいちばん下と、プロジェクトがないときの案内 `NoProjectsWelcome` にも、あるときだけここを開く口）と、アーカイブ済みのチャットの整理（日数 `ARCHIVE_CLEANUP_DAYS` を選ぶと、それより前から動いていないアーカイブ済みのチャットの数と会話記録の大きさ（`api.archiveCleanupPreview`）が出て、確かめてからまとめてゴミ箱へ入れる `api.archiveCleanup`。アーカイブは自動では消えないため）・どのチャットも使っていない会話記録（`OrphanSessions`。「探す」で `api.orphanSessions` の一覧（最初の発言・日付・大きさ・作業フォルダ）を出し、選んだものを確かめてから `api.trashOrphanSessions`。ターミナルで直接使った Claude Code の記録も出るので自動では消さない。Kickoff の 1 回だけの問い合わせ（名前付け・要約など。前の版が残したもの。`kickoff_ask`）の記録には札を付け、「Kickoff の問い合わせの記録を選ぶ（n 件）」でまとめて選べる）・どのプロジェクトにも出ないゴミ箱のもの（`useUnassignedTrash`。あるときだけ。行はタブと同じ `TrashRow`）。
- 会話記録（種類 `session`）の行は、誰が消したかを「Kickoff の片付け」と出す（長いチャットの乗り換え・使われなくなった記録の片付けで Kickoff が入れるため）。
- CSS は `styles/project/trash.css`（タブ・設定の行）と `styles/chat/bash-output.css` の末尾（会話の中の行）。
