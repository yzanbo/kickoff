# DB クライアント（`features/database`）

プロジェクトの「DB」タブ（`ProjectPage` の `tab === "db"`）・チャットの画面の右の欄の DB のタブ・その別ウィンドウで使う DB クライアント。要件は `docs/requirements.md` の 5.12、コア（表 `db_connections`・API・DB ワーカー）は `src/core/CLAUDE.md` の「DB クライアント」。この Mac のアプリの中だけで使う（コアの API は 127.0.0.1 からだけ受け、画面もブラウザ・スマホから開いたときは「DB」タブを出さずボードにする。`window.kickoff` があるか）。

## 置き場所と部品

- `DatabaseClient`（左に接続の一覧と木 `DbTree`、右にタブ（テーブル `TableView` / 関数・列挙型 `DefinitionView` / SQL `SqlView`））を 1 つ作り、置き場所（`place`: プロジェクトの DB タブ = `project-<ID>`、右の欄と別ウィンドウ = `chat-<右の欄のチャット>`（移しても同じタブのまま））ごとに開いているタブ（`dbClientTabs(place)`。形と操作は純粋関数の `lib/dbClientTabs.ts`）と木の開き具合（`dbTreeOpen(place)`）を覚える。`worktree` は SQLite のファイルを開く作業場所（プロジェクトの画面では、ファイル・検索・変更・履歴のタブで選んだ作業場所、右の欄ではそのチャットの作業場所。null なら本体）。
- 下の部品が読む操作（プロジェクト・置き場所・作業場所・タブを開く・接続を編集）は `DbClientContext`（`dbClientContext.ts` の `useDbClient`）で配る。
- 左の一覧の幅は `DB_LIST_WIDTH`（つまみ）、隠すかは `DB_LIST_HIDDEN`。欄の幅が 560px より狭いと一覧を隠し、左上のボタンで重ねて出し、タブの下にパンくず（接続 › DB › スキーマ › テーブル）を出す（`ResizeObserver` で `DatabaseClient` の幅を測る）。
- 接続の登録・編集は `ConnectionDialog`（URL を貼ると欄を埋める `@shared/database/dbUrl.ts` の `parseDbUrl`。種類・環境（`DB_ENVIRONMENT_DEFAULTS`: 本番は読み取り専用・AI に見せない）・SSL・「つながるか試す」・チャットの AI に見せるか（見せない / 承認して見せる / 自由に見せる。見せないは AI がコマンド・ファイルで直接つなぐのも断るが、わざと避ける書き方までは見抜けないことを説明に書く）と、見せるときだけ AI 用のユーザーとパスワード（任意。AI が SQL を流すときだけそのユーザーでつなぐ。パスワードは `has_ai_password` だけが届く））。ほかのプロジェクトの接続を写すのは `CopyConnectionDialog`（パスワードは「パスワードも写す」のときだけ）。接続の一覧は `stores/dbConnections.ts`（SSE の `db_connections` で取り直す。中身は SSE に載せない）。
- パスワードは送るだけで、画面には保存したか（`has_password`）だけが届く。
- 右の欄（`features/panel/CLAUDE.md` のタブの種類 `database`。欄に 1 つ）: ▾ のメニューの「DB ▸」（`DbMenuItems`: DB クライアントを開く ｜ 接続ごとに、新しい SQL のタブを開いて DB クライアントを開く。この Mac のアプリの中だけ）。タブの列の右端に「別ウィンドウで開く」（`PopOutTabButton`。右の欄のときだけ出る）。

## 木（`DbTree`）

接続 → DB（PostgreSQL・MySQL）→ スキーマ（PostgreSQL）→ テーブル・ビュー・関数・列挙型の段（`DbTreeObjects.tsx`）→ テーブル・ビューの中の段。行の部品と読み込み（`TreeRow` / `TreeHint` / `TreeError` / `useNodeLoad`）は `DbTreeRow.tsx`。段ごとに開いたときに読む（`useNodeLoad`。失敗の `ApiError.code` を残す）。ワークツリーにその SQLite のファイルがない（`DB_NOT_IN_WORKTREE`）ときは失敗の行に「本体のものを開く」を出し、その接続だけ本体のファイルを開く（`useMain`。画面を閉じるまで）。接続の右クリック: SQL を開く・編集…・消す…（パスワードも消える。DB の中身には触らない）。

- テーブル・ビューは、名前を押すとタブを開き（`openOnClick`）、矢印を押す・→ / ← で中の段を開閉する。中の段は列（主キーは琥珀の鍵 `.db-tree-pk`、右に型と NOT NULL。名前を先に見せ、入らなければ型の方を省く）と、あるときだけ開閉のまとまり（インデックス・外部キー・トリガー。数を添える）。中身は `api.dbTable`（テーブルのタブと同じ詳細）。中の行を押すとそのテーブルのタブを開く。開き具合は段と同じく `dbTreeOpen(place)`（キーは `t:<接続>:<DB>:<スキーマ>:<名前>` と、まとまりは後ろに `:idx` / `:fk` / `:trg`）。
- 関数（PostgreSQL は `名前(引数)` で同じ名前の別の引数も分ける。MySQL / MariaDB は関数とプロシージャを名前で 1 つ）・列挙型（PostgreSQL だけ。MySQL の ENUM は列の型）は葉で、押すと定義のタブを開く。アイコンは木とタブで同じ（`TabObjectIcon`）。SQLite には出ない。

## テーブルのタブ（`TableView`）

データ / 構造 / リレーション / DDL / 情報の切り替え。データは 100 行ずつ（「さらに 100 行読む」）、列の見出しを押すと並べ替え（昇順 → 降順 → なし。`dbFormat.ts` の `nextSort`。ORDER BY を付けて取り直す）。全体の行数は統計の推定（SQLite にはないので「数えていません」）で、「正確に数える」を押したときだけ COUNT(*)。表は `DataGrid`（見えている行だけ描く・26px の同じ高さ・セルを押して ⌘C でコピー・NULL とバイナリ（「バイナリ n B」）は薄く斜体・数は右寄せ）。

## 関数・列挙型のタブ（`DefinitionView`）

テーブルのタブと同じ `DbTableTab`（`object` が `function` / `enum`。キーは `tableTabKey` の頭の印でテーブルと分ける）。上に引数・戻り値（プロシージャは「なし」）か値と説明、下に作る文（`api.dbDefinition`。PostgreSQL は `pg_get_functiondef`・列挙型は値から組み立て、MySQL は SHOW CREATE（権限がなければ本文だけ））。作る文の `<pre>` には右上にコピーのボタン（テーブルの DDL と同じ）。

## SQL のタブ（`SqlView`）

- 上に入力欄 `SqlEditor`（CodeMirror ＋ `@codemirror/lang-sql`。DB の種類の方言、補完はテーブルと列の名前（`api.dbOutline`））、下に文ごとの結果。境目のつまみで高さを変える（`DB_SQL_EDITOR_HEIGHT`。%）。書きかけの SQL は `dbSqlDraft("<place>:<タブのキー>")` に覚え、タブを閉じたら消す。
- ⌘↵ / 「流す」= カーソルのある文（選んでいればその範囲の文）、⇧⌘↵ / 「すべて流す」= すべての文。文は `@shared/database/sqlStatements.ts` の `splitStatements` で分け、1 つずつ送る（コアは 1 回に 1 文だけ受ける）。失敗した文・止めた文で止め、後ろの文は流さない。結果は 2 文以上なら番号のタブ（失敗は赤）。
- タブごとに DB の接続を 1 本持つ（接続の名前はタブのキー）。トランザクションの途中なら、帯に「コミットしていない変更があります」とコミット / 取り消すを出し、タブの名前の後ろに琥珀の点（`sqlSessions.ts` の `setSqlPending` / `useSqlPending`。開いたときに `api.dbSessionState` で読み直す）。タブを閉じるときは、途中なら `finishSession` でコミット / 取り消すを聞く（やめたら閉じない）。
- 止める: `api.cancelDbSql`（SQLite は DB ワーカーを止めて、次の頼みで立ち上げ直す）。
- 道具の行の右に接続の環境の札（環境の色の点と名前 `.db-sql-env`）。
- 読み取り専用の接続では帯に「読み取り専用」を出し、書く文はコアが断る（1 段目は文の判定 `isReadOnlyStatement`、2 段目は DB 側の読み取り専用）。
- 「書き込む」（`useSqlWrite`。要件 5.12 の本番の守り）: 読み取り専用の接続で、このタブだけ読み取り専用を外す（API の `write: true`。接続の設定は変えない）。押すと環境の名前（「本番」など）を打たせ、違えば外さない。外している間は上に赤い帯（「読み取り専用に戻す」）とタブの枠の赤い線、流すたびに流す文を見せて確かめる（`confirmDialog`。やめたら流さない）。10 分何もしない（流す・打つがない）と戻し、トランザクションの途中ならコミットか取り消しのあとに戻す（コミット・取り消しは何かしたに数えない。数えると、待っていた戻しが 10 分先に延びる）（読み取り専用に戻すとワーカーの接続をつなぎ直すため。途中は「読み取り専用に戻す」「書き込む」も押せない）。覚えないので、タブを閉じる・読み込み直す・別ウィンドウへ移すと戻る。

## CSS

`styles/database/`（`db-client.css` = 枠・一覧・木・タブ・環境の色 `--db-env`（ローカル灰・開発緑・ステージング琥珀・本番赤。`.db-env-<環境>`）、`db-table.css` = `DataGrid` とテーブルのタブ、`db-sql.css` = SQL のタブと接続のダイアログ）。
