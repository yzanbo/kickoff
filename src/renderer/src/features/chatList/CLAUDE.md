# チャットをまとめて並べる仕組み（`features/chatList`）

サイドバーのまとまり・ボードの段と列・パネルのタブのまとまり・状態ごとの一覧・⌘⇧A で共通の、まとめ方・数え方・開閉の記憶。同じ形を場所ごとに書かず、ここを使う。

## まとまりに分ける（`buckets.ts` の `bucketChats`）

- まとまりで始める新しいチャットの作成先は `newChatPlaceOf(head)`（グループ = そのグループ・No Group = グループなし・作業場所 = 本体 / そのワークツリー。フォルダなし・以前のブランチ・状態・固定・アーカイブ済みなどは null）。見出しの右クリックの「新しいチャット」（サイドバー・タブのまとまりの札・ボードの段）で共通に使う。

- 純粋な関数 `bucketChats(chats, options)` で分ける（画面では店から状態を渡す `useChatBuckets`。グループ・作業場所で分けるときだけ、その一覧を読む `useBucketContext`。閉じているサイドバーのプロジェクトでは読みに行かない）。例: サイドバーのグループ別 × 状態順 = `by: ["group", "status"]`・`project`・`pinned: true`・`archived: "nested"`（まとめないときは `"bucket"`）、ボードの列 = `by: "status"`・`keepEmpty: true`、⌘⇧A = `by: "status"`・`columns: COUNTED_COLUMNS`・`archived: "drop"`。
- 分け方 `BucketBy`: `project` / `group` / `worktree`（作業場所 = ブランチ）/ `status`（カンバンの列）。外の段から順に渡し、空ならまとめない（見出しのないまとまり `all` 1 つ）。オプション: `project`（1 つのプロジェクトの中だけ）・`columns`・`pinned`（固定を抜き出す）・`archived`（`keep` / `bucket` = 「アーカイブ済み」に抜き出す / `nested` = いちばん外の段のまとまりごとに、そのまとまりのアーカイブ済みを `bucket.archived`（キーは `p3/g5/archived`。中は分けない）に入れる。アーカイブ済みだけのまとまりも作る。段がなければ `bucket` と同じ。サイドバーのグループ別・作業場所別 / `drop`）・`drafts`（下書き）・`keepEmpty`（チャットも下書きもないまとまりも出す）・`sort`（まとまりの中のチャットの並び。既定は最後に動いた順 `byActive`。ボードは並び順 `chatComparator` を渡す）。
- まとまりのキーは、プロジェクトを根にした道のりの 1 つの形にそろえ、開閉の記憶・React の key・タブのまとまりのキーにそのまま使う（どこで分けても、同じまとまりは同じキー）: プロジェクト `p3` / グループ `p3/g5` / グループなし `p3/ungrouped` / 作業場所 `p3/w:main`・`p3/w:<フォルダ>`・`p3/w:branch:<ブランチ>` / 固定 `p3/pinned` / アーカイブ済み `p3/archived` / 状態 `status:running`（プロジェクトの中なら `p3/status:running`）。中の段は親のキーに `/` でつなぐ（`p3/g5/status:read`）。キーと見出しは `bucketHeads.ts`（`projectKey` / `groupKey` / `pinnedKey` / `archivedKey`・`chatHead` / `draftHead` / `workplaceHead`。パネルのタブのまとまりもこれで決める）。
- 決まり（どこで分けても同じ）:
  - もうないグループ（消した・まだ読み込んでいない）のチャット・下書きは「No Group」に入れる。
  - プロジェクトで分けるときに並び `projects` を渡したら、そこにあるプロジェクトの段だけを作る（全プロジェクトのボードではしまったものを出さない）。
  - 下書きの行き先: グループ = 作成先のグループ / プロジェクト = そのプロジェクト / 作業場所 = 始める作業場所（ワークツリーのチャットのタブの右クリックの「新しいチャット」から始めたものはそのワークツリー。ほかは本体。作業場所は送るまで選び直せる `DraftTarget.worktree`）/ 状態 = 入れない（下書きは別に並べる）。
  - 手動の並び（サイドバーの並び順「手動」）: まとまりの中を `sort: byManual`（`manualOrder.ts`。`Chat.position` の順で、まだ並べていない新しいチャットはいちばん上）で並べる。ドラッグで並べ替えられる範囲（いちばん外のまとまり。まとまりのアーカイブ済みはそのキー）は `bucketScopes`、並びの中で動かすのは `moveChatInOrder`、画面に並ぶ順の 1 列は `buckets.ts` の `flattenBucketChats`。
  - 並び: プロジェクトの順（渡した並び → ほかは出てきた順）、その中は 固定 → グループ（サイドバーと同じ並び）・作業場所（本体 → ワークツリー（名前順）→ フォルダなし → 以前のブランチ）・状態（作業中 → 回答待ち → 未読 → 既読）→ グループなし、いちばん後ろにアーカイブ済み → その他（`sortBuckets`）。まとまりの中のチャットは最後に動いた順（`sort` を渡せばその順）。

## まとめ方の設定

- チャットのまとめ方 `ChatGrouping`（`none` = まとめない / `group` = グループ別 / `worktree` = 作業場所別。`chatGrouping.ts` の `CHAT_GROUPINGS` / `CHAT_GROUPING_LABELS`）は、サイドバーと右のパネルのタブの列で同じ選択肢・同じ文言（どちらも「チャットのまとめ方」）。覚えるのは別々（サイドバーは `SIDEBAR_CHAT_SECTIONS`、タブは欄ごとの `panelTabGrouping`）。
- まとまりの色（`bucketHues.ts`）: グループ別・作業場所別のまとまりの色は、サイドバーの見出しとパネルのタブのまとまりの札・タブの線で同じにする。画面に出ているまとまりではなく、プロジェクトのまとまりになりうるものすべてから決める（`projectBucketHues`。グループ別 = 自分で作ったグループの覚えた色 `ChatGroup.hue` をグループの並びで、作業場所別 = いまある作業場所のブランチの印と同じ色 `workplaceHue` を先に取り、そのあと固定 → グループなし → アーカイブ済みがキーから決まる色を取る。被れば空いている色へ `spreadHues`。10 色を使い切ったら被ってよい）。以前はタブの列に並んでいるまとまりだけで決めていたので、隠したグループ・開いていないタブで色が変わり、サイドバーと合わせられなかった。引くのは `bucketHueOf`（「その他」・状態・まとめないときは null）、画面からは `useBucketHueOf(まとめ方, プロジェクト, オンか)`。色を付けるかは場所ごとの設定（サイドバー `SIDEBAR_BUCKET_COLORS`（初めは付ける）・タブの列 `PANEL_TAB_GROUP_COLORS`（初めは付ける。すべての欄で共通））で、メニューの項目は `BucketColorItem`（「まとまりを色付きで表示」）。
- サイドバーの表示の切り替え（すべてのプロジェクトに効く。`chatListFlags.ts`）: チャットを 1 行で出すか `useCompactRows`・プロジェクトのカードを 1 行で出すか `useCompactProjects`・アーカイブ済みのチャットを出すか `useShowArchivedChats`（`SIDEBAR_SHOW_ARCHIVED`。サイドバー・右のパネルのタブ・ボードの絞り込みで連動）。要対応（回答待ち・未読）は `isWaitingState` / `waitingChats`。

## 数え方

- 状態ごとのチャット数は `features/chat/chatState.ts` の `stateCounts`（カンバンの列と同じ決め方 `boardColumnOf`。数えるのは作業中・回答待ち・未読 `COUNTED_COLUMNS` で、既読とアーカイブ済みは数えない。作業中のまま未読のものは作業中として数える）。サイドバーのプロジェクト・画面の見出し・タブのまとまりの札で同じ数になるよう、数えるのはここだけ（`bucketChats` のまとまりの `counts` もこれ）。
- 角に出す数は `StateCornerCounts`（左上 = 作業中（青）・右上 = 未読（緑）・左下 = 回答待ち（オレンジ）。0 は出さない）。サイドバーのプロジェクトの丸・プロジェクトの画面の左のボードのタブ・右のパネルのタブのまとまりの札で共通。置く要素は position: relative、丸の縁の色は `--corner-ring`、はみ出す量は `--corner-offset`（CSS は `styles/ui/status.css` の `.corner-count`）。`inline` なら文の後ろに色付きの数を並べる（横並びのタブ）。文にするなら `stateCountsSummary`。
- 状態ごとのチャットの一覧は `StateChatsPopover`（作業中 → 回答待ち → 未読のまとまりにチャットを並べ、行を押すと `onOpen`。行の左にはサイドバーの行と同じ `StatusSlot` を見出しの点の真下に。`showProject` で行にプロジェクト名）。分け方は `chatsByState`（数え方は `stateCounts` と同じ。`all` なら既読と、いちばん下にアーカイブ済みも並べ、渡したチャットをすべて出す）。画面の見出しの状態ごとの数 `StateStats` と、右のパネルのタブのまとまりの札 `TabClusterHead` で共通。色は `bucketTone`、CSS は `styles/chatList/state-chats.css`。

## 開閉の記憶（`hooks/useFold`）

- まとまりの開閉は、どこでも `lib/storageKeys.ts` の `FOLDS` 1 つに `<場所>:<まとまりのキー>` で覚える（`"1"` = 開いている / `"0"` = 閉じている。覚えていなければまとまりごとの初めの値: アーカイブ済みは閉じる・ほかは開く）。場所は `sidebar`（サイドバー。見出しの「すべて閉じる / 開く」`foldAll` が効く）・`board:<ボード>`（ボードの段・列のアーカイブ済み）・`panel`（タブのまとまり。すべてのパネル・ペインで共通）・`composer`（入力欄の上のサブエージェント・子チャットの一覧のアーカイブ済み。すべてのチャットで共通）。
- まとまり 1 つは `useFold(place, key, { defaultOpen, forceOpen })`、一覧の中でいくつもは `useFolds(place, keys)`（渡した keys のどれかが変わったときだけ描き直す）。検索・絞り込みの間は `forceOpen` で開いて見せる。見出しの土台は `FoldHead` / `FoldSection`、高さは `Collapse`。
