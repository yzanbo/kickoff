# DB クライアント（`features/database`）

プロジェクトの「DB」タブ（`ProjectPage` の `tab === "db"`）で使う DB クライアント。要件は `docs/requirements.md` の 5.12、コア（表 `db_connections`・API・DB ワーカー）は `src/core/CLAUDE.md` の「DB クライアント」。この Mac のアプリの中だけで使う（コアの API は 127.0.0.1 からだけ受け、画面もブラウザ・スマホから開いたときは「DB」タブを出さずボードにする。`window.kickoff` があるか）。

## 置き場所と部品

- `DatabaseClient`（左に接続の一覧と木 `DbTree`、右にタブ（テーブル `TableView` / SQL `SqlView`））を 1 つ作り、置き場所（`place`: プロジェクトの DB タブ = `project-<ID>`。右の欄・別ウィンドウはこれから）ごとに開いているタブ（`dbClientTabs(place)`。形と操作は純粋関数の `lib/dbClientTabs.ts`）と木の開き具合（`dbTreeOpen(place)`）を覚える。`worktree` は SQLite のファイルを開く作業場所（プロジェクトの画面では、ファイル・検索・変更・履歴のタブで選んだ作業場所。null なら本体）。
- 下の部品が読む操作（プロジェクト・置き場所・作業場所・タブを開く・接続を編集）は `DbClientContext`（`dbClientContext.ts` の `useDbClient`）で配る。
- 左の一覧の幅は `DB_LIST_WIDTH`（つまみ）、隠すかは `DB_LIST_HIDDEN`。欄の幅が 560px より狭いと一覧を隠し、左上のボタンで重ねて出し、タブの下にパンくず（接続 › DB › スキーマ › テーブル）を出す（`ResizeObserver` で `DatabaseClient` の幅を測る）。
- 接続の登録・編集は `ConnectionDialog`（URL を貼ると欄を埋める `@shared/database/dbUrl.ts` の `parseDbUrl`。種類・環境（`DB_ENVIRONMENT_DEFAULTS`: 本番は読み取り専用・AI に見せない）・SSL・「つながるか試す」）。ほかのプロジェクトの接続を写すのは `CopyConnectionDialog`（パスワードは「パスワードも写す」のときだけ）。接続の一覧は `stores/dbConnections.ts`（SSE の `db_connections` で取り直す。中身は SSE に載せない）。
- パスワードは送るだけで、画面には保存したか（`has_password`）だけが届く。

## 木（`DbTree`）

接続 → DB（PostgreSQL・MySQL）→ スキーマ（PostgreSQL）→ テーブル・ビューの段。段ごとに開いたときに読む（`useNodeLoad`。失敗の `ApiError.code` を残す）。ワークツリーにその SQLite のファイルがない（`DB_NOT_IN_WORKTREE`）ときは失敗の行に「本体のものを開く」を出し、その接続だけ本体のファイルを開く（`useMain`。画面を閉じるまで）。接続の右クリック: SQL を開く・編集…・消す…（パスワードも消える。DB の中身には触らない）。

## テーブルのタブ（`TableView`）

データ / 構造 / リレーション / DDL / 情報の切り替え。データは 100 行ずつ（「さらに 100 行読む」）、列の見出しを押すと並べ替え（昇順 → 降順 → なし。`dbFormat.ts` の `nextSort`。ORDER BY を付けて取り直す）。全体の行数は統計の推定（SQLite にはないので「数えていません」）で、「正確に数える」を押したときだけ COUNT(*)。表は `DataGrid`（見えている行だけ描く・26px の同じ高さ・セルを押して ⌘C でコピー・NULL とバイナリ（「バイナリ n B」）は薄く斜体・数は右寄せ）。

## SQL のタブ（`SqlView`）

- 上に入力欄 `SqlEditor`（CodeMirror ＋ `@codemirror/lang-sql`。DB の種類の方言、補完はテーブルと列の名前（`api.dbOutline`））、下に文ごとの結果。境目のつまみで高さを変える（`DB_SQL_EDITOR_HEIGHT`。%）。書きかけの SQL は `dbSqlDraft("<place>:<タブのキー>")` に覚え、タブを閉じたら消す。
- ⌘↵ / 「流す」= カーソルのある文（選んでいればその範囲の文）、⇧⌘↵ / 「すべて流す」= すべての文。文は `@shared/database/sqlStatements.ts` の `splitStatements` で分け、1 つずつ送る（コアは 1 回に 1 文だけ受ける）。失敗した文・止めた文で止め、後ろの文は流さない。結果は 2 文以上なら番号のタブ（失敗は赤）。
- タブごとに DB の接続を 1 本持つ（接続の名前はタブのキー）。トランザクションの途中なら、帯に「コミットしていない変更があります」とコミット / 取り消すを出し、タブの名前の後ろに琥珀の点（`sqlSessions.ts` の `setSqlPending` / `useSqlPending`。開いたときに `api.dbSessionState` で読み直す）。タブを閉じるときは、途中なら `finishSession` でコミット / 取り消すを聞く（やめたら閉じない）。
- 止める: `api.cancelDbSql`（SQLite は DB ワーカーを止めて、次の頼みで立ち上げ直す）。
- 読み取り専用の接続では帯に「読み取り専用」を出し、書く文はコアが断る（1 段目は文の判定 `isReadOnlyStatement`、2 段目は DB 側の読み取り専用）。

## CSS

`styles/database/`（`db-client.css` = 枠・一覧・木・タブ・環境の色 `--db-env`（ローカル灰・開発緑・ステージング琥珀・本番赤。`.db-env-<環境>`）、`db-table.css` = `DataGrid` とテーブルのタブ、`db-sql.css` = SQL のタブと接続のダイアログ）。
