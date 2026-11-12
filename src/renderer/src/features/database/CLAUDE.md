# DB クライアント（`features/database`）

プロジェクトの「DB」タブ（`ProjectPage` の `tab === "db"`）・チャットの画面の右の欄の DB のタブ・その別ウィンドウで使う DB クライアント。要件は `docs/requirements.md` の 5.12、コア（表 `db_connections`・API・DB ワーカー）は `src/core/CLAUDE.md` の「DB クライアント」。この Mac のアプリの中だけで使う（コアの API は 127.0.0.1 からだけ受け、画面もブラウザ・スマホから開いたときは「DB」タブを出さずボードにする。`window.kickoff` があるか）。

## 置き場所と部品

- `DatabaseClient`（左に接続の一覧と木 `DbTree`、右にタブ（テーブル `TableView` / 関数・列挙型 `DefinitionView` / SQL `SqlView` / ER 図 `er/ErView` / 手順メモ（`SideMemo`））。タブの名前・説明・アイコン・パンくずは `DbTabParts.tsx`）を 1 つ作り、置き場所（`place`: プロジェクトの DB タブ = `project-<ID>`、右の欄と別ウィンドウ = `chat-<右の欄のチャット>`（移しても同じタブのまま））ごとに開いているタブ（`dbClientTabs(place)`。形と操作は純粋関数の `lib/dbClientTabs.ts`）と木の開き具合（`dbTreeOpen(place)`）を覚える。`worktree` は SQLite のファイルを開く作業場所（プロジェクトの画面では、ファイル・検索・変更・履歴のタブで選んだ作業場所、右の欄ではそのチャットの作業場所。null なら本体）。
- 下の部品が読む操作（プロジェクト・置き場所・作業場所・タブを開く・接続を編集・手順メモを開く `openMemo`・つながらないときの案内を出す `showFailure`・つなぐ前の準備のダイアログを出す `showPrep`）は `DbClientContext`（`dbClientContext.ts` の `useDbClient`）で配る。
- 左の一覧の幅は `DB_LIST_WIDTH`（つまみ）、隠すかは `DB_LIST_HIDDEN`。欄の幅が 560px より狭いと一覧を隠し、左上のボタンで重ねて出し、タブの下にパンくず（接続 › DB › スキーマ › テーブル）を出す（`ResizeObserver` で `DatabaseClient` の幅を測る）。
- 接続の登録・編集は `ConnectionDialog`（入力欄の値と送る形は `connectionForm.ts`。URL を貼ると欄を埋める `@shared/database/dbUrl.ts` の `parseDbUrl`。種類・環境（`DB_ENVIRONMENT_DEFAULTS`: 本番は読み取り専用・AI に見せない。新しい接続で環境を変えると、読み取り専用・書き込む前の確かめ・AI の既定をその環境のものにする）・書き込む前の確かめ（読み取り専用でないときだけ出す選択: 危険な文だけ / 書き込みのたびに SQL を見せる / 環境の名前を打つ。`DB_WRITE_CHECK_LABELS`）・SSL・「つながるか試す」・チャットの AI に見せるか（見せない / 承認して見せる / 自由に見せる。見せないは AI がコマンド・ファイルで直接つなぐのも断るが、わざと避ける書き方までは見抜けないことを説明に書く）と、見せるときだけ AI 用のユーザーとパスワード（任意。AI が SQL を流すときだけそのユーザーでつなぐ。パスワードは `has_ai_password` だけが届く）・SSH トンネル（`ConnectionSshFields`。「SSH トンネルを通す」のチェックで開く欄: 踏み台（~/.ssh/config の Host を `api.dbSshHosts` で候補に）・ポート・ユーザー・鍵のファイル・SSH のパスワード（`has_ssh_password` だけが届く。「保存した SSH のパスワードを消す」）。チェックを外すと `ssh: null` でパスワードも消える）・つなぐ前の準備（`ConnectionPrepFields`。「つなぐ前にコマンドを流す」のチェックで開く欄: 準備・後片付けのコマンド（1 行に 1 つ）・ポートを転送するコマンド（SSH トンネルと一緒には使えないので、SSH を通すときは押せない）・パスワードを取るコマンド（SQLite には出さない）・`{my_ip}` を使うときだけ問い合わせ先・使える `{名前}` の一覧。値は `connectionForm.ts` の `prepOf`）と次に確かめる日とひとこと・手順メモ（`ConnectionMemoField`。なし・メモのフォルダの Markdown と HTML（`DB/` の下を先に。`dbMemo.ts` の `memoChoices`）。選んでいるメモがもうなければ「（見つかりません）」で残す）。「つながるか試す」が失敗したら、よくある原因（`DbFailureHelp`）も出す。初めての踏み台（結果の `code` が `DB_SSH_UNKNOWN_HOST`）なら代わりに「サーバーの鍵を確かめる…」）。初めての踏み台の鍵は `SshHostKeyDialog`（`api.dbSshHostKey` の指紋（SHA256）を見せ、「受け入れてつなぐ」で `api.acceptDbSshHostKey` が `~/.ssh/known_hosts` に足してからつなぎ直す。入口は「つながるか試す」と木の失敗の行。接続のダイアログの中に開くので、close の知らせを止めて外のダイアログまで閉じないようにしている）。ほかのプロジェクトの接続を写すのは `CopyConnectionDialog`（パスワードは「パスワードも写す」のときだけ）。プロジェクトから取り込むのは `ImportConnectionDialog`（一覧の見出しのボタンと、接続がないときの一覧の「プロジェクトから取り込む」。コアが .env・docker compose・Prisma・SQLite のファイルから見つけた案（`api.dbImportCandidates`）を、まだ登録していないものを選んだ形で並べ、名前と環境を直して取り込む（`api.importDbConnections`）。見つけた所・種類と場所・「パスワードあり」・「登録済み」・注意（compose のサービス名の読み替え・ポートを外に出していない・外のホストを本番にした）を添える。パスワードは画面に来ない）。接続の一覧は `stores/dbConnections.ts`（SSE の `db_connections` で取り直す。中身は SSE に載せない）。
- パスワードは送るだけで、画面には保存したか（`has_password`）だけが届く。
- 保存したパスワードをキーチェーンで開けなかったとき（利用者が拒否した。コアが 409 と `DB_PASSWORD_LOCKED`）: つなぐ API（`api/databases.ts` の `connecting` で包んだもの: 試す・DB / スキーマ / 段の一覧・テーブル・定義・行・数・保存・補完・ER 図・SQL）が、`DbUnlockHost`（App と別ウィンドウに 1 つずつ。`setDbUnlock` で口を置く）に聞き、画面の真ん中のダイアログ（接続の名前・「保存したパスワードを読めませんでした（キーチェーンで許可されませんでした）」・保存してある種類のパスワードの欄（DB・SSH は要る、AI 用は省ける）・「接続」「やめる」）を出す。「接続」は `api.enterDbPasswords`（Kickoff を終えるまでコアのメモリにだけ持ち、その接続のほかのタブ・AI のツールでも使う。保存した値は変えない）のあと頼みをやり直し、「やめる」は失敗のまま返す。ダイアログは接続ごとに 1 つ（同時に失敗した頼みは同じ答えを待ってからやり直す）、いくつもの接続ならひとつずつ聞く。
- 右の欄（`features/panel/CLAUDE.md` のタブの種類 `database`。欄に 1 つ）: ▾ のメニューの「DB ▸」（`DbMenuItems`: DB クライアントを開く ｜ 接続ごとに、新しい SQL のタブを開いて DB クライアントを開く。この Mac のアプリの中だけ）。タブの列の右端に「別ウィンドウで開く」（`PopOutTabButton`。右の欄のときだけ出る）。

## 接続の手順メモ・つながらないときの案内

- 手順メモ（要件 5.12 の段階 2）: 接続の `memo_path` のメモ（メモのフォルダからの相対パス。つなぎ方（経路）ごとに 1 つで、いくつもの接続で同じメモを使える）。DB クライアントの中のタブ（`DbMemoTab`。キーはメモのパスごとに 1 つ `memoTabKey`。中身はチャットの右の欄と同じ `SideMemo` で、⌘S で保存・メモのチャットも使える。題名で名前を変えたら `renameMemoTab` でタブを付け替え、接続の側はコアが付け替える）で開く。入口は接続の右クリックの「手順メモを開く」（なければ「手順メモを作る…」）・案内の「開く / 手順メモを作る…」（`DatabaseClient` の `openConnectionMemo`）・接続の編集の「手順メモ」。作るのは `dbMemo.ts` の `createConnectionMemo`（名前はつなぎ方の名前をすすめる `suggestDbMemoName`（「本番（db.example.com）」）。メモのフォルダの `DB/` の下にひな形 `dbMemoTemplate`（つなぐ前にやること・つながらないときの直し方・関係する場所・変えた履歴。パスワードは書かないよう添える）で作り、同じ名前があればそれを使うか聞いてから接続に結ぶ）。木の接続の行の名前の後ろに小さな印（`.db-tree-memo`。乗せるとメモのパス）。
- つながらないときの案内（`DbFailureDialog`）: 木の失敗の行の「直し方を見る」（`TreeError`。ワークツリーにファイルがないときは今までどおり「本体のものを開く」）から。失敗の文・見分けた種類とよくある原因（`@shared/database/dbFailure.ts` の `dbFailureKind` / `DB_FAILURE_CAUSES`。時間切れ・断られた・名前が引けない・パスワード・許可・SSL・DB がない・SQLite のファイル。IP の許可・VPN・トンネル・休止・ローテーションなど、わざと手順を踏ませる仕組みを原因に入れる）・最後につながった日時・手順メモの中身（Markdown で。なければ作るボタン）・「AI に直してもらう」（確かめてから、新しいチャットに `dbFixPrompt`（失敗の文・種類・接続の設定（パスワードは入れない）・手順メモの場所と、直ったら書き足すこと・守りを弱める直し方をしないこと）を送って作り、そのチャットを開く。別ウィンドウからはメインのウィンドウで開く `openChat` の知らせ）・「つなぎ直す」（接続の段だけ。その段を読み直す）。準備のコマンドがあれば「準備を流す…」（準備のダイアログを、案内の「つなぎ直す」と同じ読み直しで開く）。「手順メモに追記」はまだ。
- つなぐ前の準備（`DbPrepDialog`。`DbClientContext` の `showPrep`）: 入口は接続の右クリックの「準備のコマンドを流す…」（準備がなくつなぐときのコマンドだけなら「つなぐときのコマンドを見る…」）・案内の「準備を流す…」・木の失敗の行の「コマンドを確かめる…」（確かめていない、つなぐときにコマンドを流す接続。`DB_PREP_UNCONFIRMED`）。登録したコマンドを種類ごとに見せ、確かめていなければ注意と「確かめて流す」（`api.confirmDbPrep` のあと `api.prepareDb`）/ つなぐときのコマンドだけなら「確かめてつなぐ」（確かめて段を読み直す）。流している間は 500ms ごとに `api.dbPrepState` を読み、コマンドごとの成否の点と出力・「止める」（`api.cancelDbPrep`）。済んだら、読み直す段があれば「つなぎ直す」、なければ「もう一度流す」。下にこれまでの記録（`api.dbPrepRuns`。種類・コマンド・成否・いつ。10 件）。開き直すと、流している途中なら続きを見せる。
- 次に確かめる日（接続の `check_on`）が今日か過ぎていれば、木の接続の行に琥珀の印（`.db-tree-check`。乗せると日付とひとこと。`@shared/database/dbPrep` の `isCheckDue`）。

## 木（`DbTree`）

接続 → DB（PostgreSQL・MySQL）→ スキーマ（PostgreSQL）→ テーブル・ビュー・関数・列挙型の段（`DbTreeObjects.tsx`）→ テーブル・ビューの中の段。行の部品と読み込み（`TreeRow` / `TreeHint` / `TreeError` / `useNodeLoad`）は `DbTreeRow.tsx`。段ごとに開いたときに読む（`useNodeLoad`。失敗の `ApiError.code` を残す）。初めての踏み台（`DB_SSH_UNKNOWN_HOST`）なら失敗の行に「サーバーの鍵を確かめる…」（受け入れたら読み直す）、ワークツリーにその SQLite のファイルがない（`DB_NOT_IN_WORKTREE`）ときは「本体のものを開く」を出し、その接続だけ本体のファイルを開く（`useMain`。画面を閉じるまで）。接続の右クリック（`ConnectionMenu`）: SQL を開く・ER 図（つないでいる DB。PostgreSQL は public のスキーマ）・手順メモを開く / 手順メモを作る…・準備のコマンドを流す…（準備のコマンドがあるとき）・編集…・消す…（パスワードも消える。DB の中身には触らない）。確かめていない、つなぐときにコマンドを流す接続は、失敗の行に「コマンドを確かめる…」。DB・スキーマの右クリックは「ER 図」（PostgreSQL の DB は public のスキーマ）、テーブル・ビューの右クリックは「開く」「この表のまわりの ER 図」（`DbTree` の 1 つのメニュー。段は `TreeOpen.menu` で右クリックした場所 `TreeMenuTarget` を知らせる）。

- テーブル・ビューは、名前を押すとタブを開き（`openOnClick`）、矢印を押す・→ / ← で中の段を開閉する。中の段は列（主キーは琥珀の鍵 `.db-tree-pk`、右に型と NOT NULL。名前を先に見せ、入らなければ型の方を省く）と、あるときだけ開閉のまとまり（インデックス・外部キー・トリガー。数を添える）。中身は `api.dbTable`（テーブルのタブと同じ詳細）。中の行を押すとそのテーブルのタブを開く。開き具合は段と同じく `dbTreeOpen(place)`（キーは `t:<接続>:<DB>:<スキーマ>:<名前>` と、まとまりは後ろに `:idx` / `:fk` / `:trg`）。
- 関数（PostgreSQL は `名前(引数)` で同じ名前の別の引数も分ける。MySQL / MariaDB は関数とプロシージャを名前で 1 つ）・列挙型（PostgreSQL だけ。MySQL の ENUM は列の型）は葉で、押すと定義のタブを開く。アイコンは木とタブで同じ（`TabObjectIcon`）。SQLite には出ない。

## テーブルのタブ（`TableView`）

データ / 構造 / リレーション / DDL / 情報の切り替え。データは 100 行ずつ（「さらに 100 行読む」）、列の見出しを押すと並べ替え（昇順 → 降順 → なし。`dbFormat.ts` の `nextSort`。ORDER BY を付けて取り直す）。全体の行数は統計の推定（SQLite にはないので「数えていません」）で、「正確に数える」を押したときだけ COUNT(*)。表は `DataGrid`（見えている行だけ描く・26px の同じ高さ・セルを押して ⌘C でコピー・↑↓←→ で選ぶセルを動かす（見えるようにスクロール）・NULL とバイナリ（「バイナリ n B」）は薄く斜体・数は右寄せ。`edit` を渡したときだけセルの書き直し）。

データ（`TableData`。行を読むのは `useTableRows`）:
- 上の絞り込みの帯（`TableFilterBar`）: 「条件」（列 ▾・比べ方 ▾・値の行を「＋ 条件」で足し、すべてを満たす行）と「WHERE を書く」（式だけ。`;` で文を足すとコアが断る）。書いている間は下書きで、「絞る」か Enter で当てる。当てた絞り込みはタブ（`DbTableTab.filter`。`setTableFilter`）に覚え、開き直しても残る。
- 表のセルの右クリック: 「この値で絞る / 除く」（NULL なら NULL である / でない。WHERE で絞っていたら条件に切り替える。`dbRowTools.ts` の `valueFilter`）・外部キーの列は「<参照先> の行を開く」（参照先のテーブルのタブを、参照する値の条件で開く。同じテーブルのタブがあればそれに当てる）・「値をコピー」。
- 「行の詳細」（下の帯の切り替え。`TableRowDetail`）: 選んだセルの行を右に縦に並べる（JSON は整え、空文字・NULL・バイナリは分かる形に。`detailText`）。外部キーの列に参照先の行へのボタン、下に「この行を指しているもの」（`referenced_by` を、この行の値の条件で開く）。
- 下の帯: 表示した行数（絞り込み中の印）・全体 / 当てはまる行の数・流す SQL（`previewRowsSql`。値は見本としてそのまま埋める）とそのコピー・「書き出す」（読み込んだ行を CSV / TSV / JSON。`exportRows`。CSV は区切り・"・改行を含むセルだけ囲み、TSV はタブと改行を空白に、バイナリは `\x` と頭の 16 進。保存は `lib/download.ts` の `downloadText`）。

## テーブルの編集（要件 5.12 の段階 3）

- 保存していない変更は `useTableEdits`（`TableView` が持つので、データ / 構造などを切り替えても残る。タブを閉じるまで）。形と操作は純粋関数の `tableEdits.ts`（`TableEdits`: 書き換え `changes`（行のキー → 列 → 値）・消す行 `deletes`・足す行 `inserts`。行のキーはキーの列の値の並びの JSON `rowKey`（読んだときの値。キーの列を書き換えても元の行を指す）。読んだ値に戻したら変更を消す `setCell`。表に出す行 `displayRows`（書き換えを重ね、足す行を後ろに。行とセルの様子）。送る形 `buildEdits`（消す → 書き換える（消す行は送らない）→ 足す））。
- 書き換えられるのはテーブルで、行を指す列（`@shared/database/dbEdit` の `editKeyColumns`: 主キー → NULL を許さない一意のインデックス）がある行（どちらもなければ行を足すことだけ。ビューは書き換えない）。読み取り専用の接続は、編集の帯の「書き込む…」（`useSqlWrite`。SQL のタブと同じく環境の名前を打たせ、上に赤い帯 `DbWriteBand`・10 分何もしなければ戻す）の間だけ。バイナリのセルは書き換えない。
- 表（`DataGrid` の `edit`）: ダブルクリック・Enter・F2 でセルの上に書き直しの欄（`.db-grid-editor`。Enter で決める・Shift+Enter で改行・Esc でやめる・外を押すと決める。初めの文から変えたときだけ変更にする。NULL は空から）。書き換えたセルは琥珀の地、足す行は緑の地と番号の代わりに「＋」（入れていない列は「既定値」）、消す行は赤の地と打ち消し線。値は文字のまま送り、型は DB が読み替える（数の列に数を入れたら、表では数のまま右に寄せる）。
- 右クリック（`TableCellMenu`）: 絞り込み・参照先の行を開く・値をコピーに加えて、「NULL にする」（NULL を許す列だけ）・「変更を戻す」・「この行を消す / 消すのをやめる」、足す行は「既定値に戻す」・「足す行を外す」。
- 編集の帯（`TableEditBar`。絞り込みの帯の下）: 「＋ 行を足す」（下に足してその行の頭のセルを選ぶ。`DataGrid` の `pickRequest`）・「CSV を取り込む…」・保存していない変更の数（書き換え・追加・削除の行数）・「取り消す」（確かめてから捨てる）・「保存」（⌘S。`TableView` で受ける。⌘⇧S のすべて保存にも `registerSavable` で知らせる）。保存は、書き直している欄を先に決めてから、流す SQL（`editStatements` の `preview`。長ければ頭だけ `clipSql`）を `confirmDialog` で見せ（書き込むの間と本番は赤いボタン）、`api.saveDbEdits` で送る。済んだら変更を消して行を読み直す。失敗（「n 番目の変更で失敗しました。すべて取り消しました: …」）は帯の下に出し、変更は残す。1 回に `DB_EDITS_MAX` 件まで。
- 保存していない変更があれば、タブの名前の後ろに琥珀の点（`DbTabParts.tsx` の `UnsavedMark`。印は `tabFlags.ts` の `unsavedTables`（キーは置き場所とタブのキー `unsavedKey`）。SQL のタブの「コミットしていない」印と同じ `createTabFlags`）。タブを閉じるときは「捨てて閉じる」か聞く（`DatabaseClient` の `closeTab`）。
- CSV の取り込み（`CsvImportDialog`。読み方は純粋関数の `csvImport.ts`）: ファイル（20 MB まで）か貼り付け。区切りは 1 行目から推す（カンマ・タブ・セミコロン `detectDelimiter`。選び直せる）。`parseDelimited`（"…" の囲み・"" ・囲みの中の改行・CRLF・BOM）。「1 行目は列の名前」なら見出しを列に当て（大文字・小文字と前後の空白を見ない。テーブルにない見出しは読まずに知らせる）、でなければ左から順に（`mapCsvRows`）。「空のセルは NULL にする」（初めはオン）。すべて空の行は飛ばす。入れる列と頭の 5 行を見せてから、足す行として読み込む（保存するまで DB は変えない。あと足せる数を超えたら断る）。

## 関数・列挙型のタブ（`DefinitionView`）

テーブルのタブと同じ `DbTableTab`（`object` が `function` / `enum`。キーは `tableTabKey` の頭の印でテーブルと分ける）。上に引数・戻り値（プロシージャは「なし」）か値と説明、下に作る文（`api.dbDefinition`。PostgreSQL は `pg_get_functiondef`・列挙型は値から組み立て、MySQL は SHOW CREATE（権限がなければ本文だけ））。作る文の `<pre>` には右上にコピーのボタン（テーブルの DDL と同じ）。

## SQL のタブ（`SqlView`）

- 上に入力欄 `SqlEditor`（CodeMirror ＋ `@codemirror/lang-sql`。DB の種類の方言、補完はテーブルと列の名前（`api.dbOutline`））、下に文ごとの結果。境目のつまみで高さを変える（`DB_SQL_EDITOR_HEIGHT`。%）。書きかけの SQL は `dbSqlDraft("<place>:<タブのキー>")` に覚え、タブを閉じたら消す。
- ⌘↵ / 「流す」= カーソルのある文（選んでいればその範囲の文）、⇧⌘↵ / 「すべて流す」= すべての文。文は `@shared/database/sqlStatements.ts` の `splitStatements` で分け、1 つずつ送る（コアは 1 回に 1 文だけ受ける）。失敗した文・止めた文で止め、後ろの文は流さない。結果は 2 文以上なら番号のタブ（失敗は赤）。
- タブごとに DB の接続を 1 本持つ（接続の名前はタブのキー）。トランザクションの途中なら、帯に「コミットしていない変更があります」とコミット / 取り消すを出し、タブの名前の後ろに琥珀の点（`sqlSessions.ts` の `setSqlPending` / `useSqlPending`。中身は `tabFlags.ts` の `createTabFlags`。開いたときに `api.dbSessionState` で読み直す）。タブを閉じるときは、途中なら `finishSession` でコミット / 取り消すを聞く（やめたら閉じない）。
- 履歴（道具の行の「履歴」。`SqlHistory.tsx` の `SqlHistoryButton`）: この接続で流した SQL（利用者と AI。新しい順に 200 件。`api.dbHistory`）をポップオーバーで出し、SQL・チャットの名前で絞り込める。AI が流したものは「AI · チャットの名前」の札。押すと入力欄の終わりに空行を挟んで足して選ぶ（`SqlEditorHandle.append`。⌘↵ でそのまま流せる・⌘Z で戻せる）。開いたときに読む（開いている間に流した分は開き直すと出る）。
- 止める: `api.cancelDbSql`（SQLite は DB ワーカーを止めて、次の頼みで立ち上げ直す）。
- 道具の行の右に接続の環境の札（環境の色の点と名前 `.db-sql-env`）。
- 読み取り専用の接続では帯に「読み取り専用」を出し、書く文はコアが断る（1 段目は文の判定 `isReadOnlyStatement`、2 段目は DB 側の読み取り専用）。
- 書き込む前の確かめ（`useSqlWrite` の `confirmRun`。読み取り専用でない接続で、「書き込む」の間でないとき）: 流す文を `@shared/database/sqlStatements.ts` の `writeConfirmation` で接続の `write_check` に当てる。読み取りの文だけなら聞かない。危険な文だけ（ローカル・開発の既定）= DROP・TRUNCATE・ALTER・WHERE のない UPDATE / DELETE・判定できない文があるときだけ、理由（「危険な文があります: ・DROP（消す）」）と SQL を見せて赤いボタンで聞く。書き込みのたび（ステージングの既定）= 書く文があれば SQL を見せて聞く（危険な文があれば理由も）。環境の名前（本番の既定）= `confirmByEnvName` で環境の名前を打たせ、違えば「流していません」。テーブルの変更の保存も、環境の名前の接続なら `confirmByEnvName` で聞く。
- 「書き込む」（`useSqlWrite`。要件 5.12 の本番の守り）: 読み取り専用の接続で、このタブだけ読み取り専用を外す（API の `write: true`。接続の設定は変えない）。押すと環境の名前（「本番」など）を打たせ、違えば外さない。外している間は上に赤い帯（`DbWriteBand`。「読み取り専用に戻す」）とタブの枠の赤い線、流すたびに流す文を見せて確かめる（`confirmDialog`。やめたら流さない）。10 分何もしない（流す・打つがない）と戻し、トランザクションの途中ならコミットか取り消しのあとに戻す（コミット・取り消しは何かしたに数えない。数えると、待っていた戻しが 10 分先に延びる）（読み取り専用に戻すとワーカーの接続をつなぎ直すため。途中は「読み取り専用に戻す」「書き込む」も押せない）。覚えないので、タブを閉じる・読み込み直す・別ウィンドウへ移すと戻る。

## ER 図のタブ（`er/`）

- `@xyflow/react`（図）と `elkjs`（自動で並べる計算。Web Worker の `elk-worker.min.js?url` で動かす）は、`DatabaseClient` が `ErView` を `lazy` で読むので、ER 図を開くまで読み込まない。xyflow の CSS も同じ塊に入る。
- タブは接続と場所（DB・スキーマ）ごとに 1 つ（`DbErTab`。`lib/dbClientTabs.ts` の `openErTab` / `updateErTab`。キーは `erTabKey`）。まわりを見る中心 `focus`・段の数 `depth`（1・2・3・すべて = `ER_ALL_DEPTH`）・描くテーブル `names`（null なら全部）をタブに覚える（読み込み直しても残る）。開き直すと `focus` を付け替え、選んで描いているテーブルに `focus` がなければ選び直す。
- 状態と操作は `useErDiagram`（構造 `api.dbEr` と覚えた位置 `api.dbErLayout` を読み、関係 `erRelations`（推測の切り替え）・まわり `erNeighborhood`・名前の絞り込みを当て、覚えた位置も自動の位置もないテーブルがあれば見せているものを `erLayout.ts` の `erAutoLayout`（elk の layered。左から右へ、指される親が右）で並べる。覚えた位置はそのまま使う）。テーブルが `DB_ER_AUTO_MAX`（100）個を超える DB では、初めは描かずに `ErPicker` で選ばせる。「この表のまわり」から開いたら、そのテーブルの詳細（`api.dbTable`）から直接つながるテーブルを選んで描く。
- 描く: 箱は `ErTableNode`（見出し・列（主キーは琥珀の鍵・外部キーはつなぐ印・型・NULL を許せば「?」）。ビューは斜体）。線は列ごとの見えない取っ手（線をつなぐ列だけ。列を出さないときは見出し）につなぎ、左右は箱の位置で決める。端の印はカラスの足（`ErMarkers`: 子の側は 0 か 1 / 0 以上の多、親の側は必ず 1 / NULL を許せば 0 か 1）、推測の関係は点線。乗せると、そのテーブルとつながったテーブル・線を強く（線に列の名前）、ほかを薄く。見えている箱だけ描く（`onlyRenderVisibleElements`）。
- 操作: 押すとテーブルのタブ（ダブルクリックと分けるため 250ms 待つ）、ダブルクリックでそのテーブルのまわりに絞る。ドラッグで動かすと、見せているテーブルの位置すべてを覚える（`api.saveDbErLayout`。ほかの覚えた位置は残す）。道具の行（`ErToolbar`）: 名前の絞り込み・まわりの段と「全体」・表示の細かさ（すべての列 / キーだけ / 名前だけ。`erColumnsOf`）・推測の関係・「テーブルを選ぶ」（`ErPicker` のポップオーバー。100 個以下なら「すべて描く」）・「自動で並べ直す」（覚えた位置を消す）・「Mermaid でコピー」・「メモに書き出す」（見えているものを `erMermaid` の文にして、メモのフォルダの一番上に「ER 図 <接続> <場所>.md」を作り、メモのタブで開くか聞く）・読み直す。
- 本番の接続の図は環境の色の枠（`.db-er.db-env-production::after`。図の地が inset の影を隠すので上に重ねる）。

## CSS

`styles/database/`（`db-client.css` = 枠・一覧・木・タブ・環境の色 `--db-env`（ローカル灰・開発緑・ステージング琥珀・本番赤。`.db-env-<環境>`）、`db-table.css` = `DataGrid` とテーブルのタブ、`db-table-tools.css` = データの絞り込みの帯・行の詳細・下の帯の流す SQL、`db-table-edit.css` = 編集の帯・書き直しの欄・変えたセル / 足す行 / 消す行の印・CSV の取り込みのダイアログ、`db-sql.css` = SQL のタブ（「書き込む」の赤い帯 `.db-write-band` はテーブルのタブと共通）と接続のダイアログ（SSH の欄・鍵を確かめるダイアログも）、`db-import.css` = プロジェクトから取り込むダイアログ、`db-failure.css` = 木の手順メモの印・つながらないときの案内とよくある原因、`db-prep.css` = 接続のダイアログの準備の欄・木の確かめる日の印・準備のダイアログ、`db-er.css` = ER 図のタブ（道具の行・箱・線と端の印・本番の枠）、`db-er-picker.css` = 描くテーブルを選ぶ一覧）。
