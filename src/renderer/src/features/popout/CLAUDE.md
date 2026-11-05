# 別ウィンドウ（`features/popout`）

チャットの画面の右の欄のサブエージェント・変更・ファイルと子チャットを、メインのウィンドウの外の別ウィンドウで見る（2 枚目の画面に差分・サブエージェントを置いたまま、1 枚目でチャットを続けるなど）。行き先・開き方・ウィンドウの間の知らせは `app/`（`popout.ts`・`windowBus.ts`・`PopoutApp.tsx`）、メインプロセスのウィンドウは `src/main/app/popouts.ts`。

- 開き方: 右の欄のタブの右クリックの「別ウィンドウで開く」と、右の欄のタブの列の道具のボタン（ピントのあるペインで表示しているタブ）。開けるタブは種類の表の `popout`（`tabKinds.ts`。サブエージェント・変更・ファイル）で、開いたら右の欄からは閉じる（`panel/tabs/popOutTab.ts`。別ウィンドウへ移す）。Mac のアプリのときだけ（`canPopout`）。
- 行き先は URL のハッシュ `#/popout/<種類>?…`（`app/popout.ts` の `popoutPath` / `parsePopout`。純粋関数でテスト）。同じもの（変更は移るファイルを除いて同じ `popoutKey`）がもう開いていれば、メインプロセスがそのウィンドウを前に出し、変更の移るファイルは知らせ `popoutFocus` で渡す。ウィンドウの位置と大きさは、最後のものから少しずらして開く（アプリを閉じるまで覚える）。
- 画面: `main.tsx` が `#/popout/` なら App の代わりに `PopoutApp`（サーバーとのつながり・回答待ち・プロジェクトの色・会話の文字の大きさだけ。サイドバー・通知・ショートカットを 2 つ動かさない）を描く。中身は右の欄と同じ部品: 変更・ファイルは `PopoutFiles`（`SideChanges` / `SideFileView`）、サブエージェントは `PopoutSubagent`（`useChatDetail` ＋ `useChatView` でチャットの画面と同じ状態と操作を作り、`SubagentScreen` を描く）、子チャット（`#/popout/chat?chat=`）は `PopoutChildChat`（チャットの画面の `ChatView` に、親を見る・メインに渡す・しまうの帯を足す。`features/chat/CLAUDE.md` の「子チャット」）。
- 子チャットのウィンドウの閉じ方（`src/main/app/popouts.ts`）: 最小化は閉じる（しまう）。✕・⌘W はメインプロセスが閉じるのを止めて画面に知らせ（IPC の `windows.onCloseRequested`）、画面が閉じ方を聞いてから `windows.closeSelf` で閉じる（画面の `beforeunload` では止められない。利用者の操作がないページでは Chromium が無視する）。アプリの終了は `app.exit` なので止めない。
- メインのウィンドウとのつながり（`app/windowBus.ts`。同じ出どころなので `BroadcastChannel`。`postToMainWindow` はメインのウィンドウを前にも出す）: 差分の行・返答へのコメントはメインのそのチャットのチャット欄に足す（`fillComposer`）、「流れで見る」は会話のその場所へ（`reveal`）、「動きで見る」は動きを開く（`showActivity`）、「ファイルタブで開く」はメインのファイルタブで開く（`openProjectFile`）、返答の「メモに追加」のあとの「開く」はメインのメモのタブで開く（`openMemo`）。受け取るのは、チャットの知らせはメインの `ChatView`（`features/chat/pane/windowMessages.ts`。同じチャットを 2 つの欄で開いていても、見えている方に 1 回だけ）、ファイルタブ・メモのタブは App。ほかのサブエージェントの画面・変更・ファイルは、別ウィンドウのまま開く（`usePopoutFileLinks`）。
- 表示の設定（会話の文字の大きさ・差分の表示のしかた・確認済みなど）は localStorage をメインのウィンドウと共有し、どのウィンドウで変えても `storage` の知らせでそろう（`lib/storage.ts`）。
