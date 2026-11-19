# DB クライアント（`features/database`）
<!-- 行き先: src/features/database/ -->

プロジェクトの「DB」タブ・チャットの右の欄の DB のタブ・その別ウィンドウの DB クライアント。コア（表 `db_connections`・API・DB ワーカー）は `src/core/CLAUDE.md` の「DB クライアント」。

| ファイル | 中身 |
|---|---|
| `DatabaseClient`・`dbClientContext.ts` | 殻（左に接続の一覧、右にタブ）・下の部品が読む操作 `useDbClient` |
| `DbList`・`DbTree*.tsx`・`DbHome` | 接続の一覧・木・接続のホーム |
| `Connection*.tsx`・`connectionForm.ts`・`*ConnectionDialog.tsx` | 接続の登録・編集・写す・取り込む |
| `DbFailureDialog`・`DbPrepDialog`・`dbMemo.ts` | つながらないときの案内・つなぐ前の準備・手順メモ |
| `TableView`・`TableData`・`DataGrid`・`tableEdits.ts` | テーブルのタブ・表・編集 |
| `SqlView`・`SqlEditor`・`useSqlWrite`・`sqlSessions.ts` | SQL のタブ・書き込みの守り・タブごとの接続 |
| `DefinitionView`・`er/` | 関数・列挙型のタブ・ER 図 |
| `dbClientRequests.ts`・`openSqlFromChat.ts` | 外（右の欄・Docker タブ・チャット）からの頼み |

開いているタブと形は `lib/dbClientTabs.ts`、接続の一覧は `stores/dbConnections.ts`、CSS は `styles/database/`。

## 決まり
<!-- 行き先: src/features/database/ -->

- この Mac のアプリの中だけで使う（`window.kickoff` がなければ「DB」タブを出さない）。
- 使う所は `LazyDatabaseClient` で読む（開くまで DB の画面と SQL の色付けを読み込まない）。ER 図も `lazy`。
- パスワードは送るだけ。画面には保存したか（`has_password` など）だけが届く。
- タブの状態は置き場所（`place`）ごとに覚える。外からの頼みは `requestDbClient`（まだ描いていなければ預ける）。
- AI に見せない接続では、AI に渡す・聞く・頼むのボタンを押せなくする。

## 書き込みの守り
<!-- 行き先: src/features/database/ -->

- 読み取り専用の接続の書く文はコアが断る（文の判定と DB 側の読み取り専用の 2 段）。外すのは「書き込む」の間だけ（環境の名前を打たせる。タブだけ・覚えない）。
- 書き込む前の確かめは `writeConfirmation` を接続の `write_check` に当てる（AI の判定と同じ `@shared/database/sqlStatements.ts`）。
- 「書き込む」を戻す時計に、コミット・取り消しを数えない（理由は `useSqlWrite.ts`）。
- SQL は `splitStatements` で分けて 1 文ずつ送り（コアは 1 回に 1 文）、失敗・止めた文で止める。
- 裏のタブの結果は量の上限（`resultBudget.ts`）で捨て、戻ったら読み取りの文だけ流し直す（書く文は流さない）。
- 接続を替える・タブを閉じる・切るとき、トランザクションの途中なら先に `finishSession` で聞く。

## 落とし穴
<!-- 行き先: src/features/database/ -->

- テーブルの編集の保存は、書き直している欄を先に決めてから SQL を見せる。送る順は `buildEdits`（消す → 書き換える → 足す）。
- 行のキー `rowKey` は読んだときの値（キーの列を書き換えても元の行を指す）。
- 長い値（`DbLongText`）は頭だけ届く。書き出し・書き直しの前に、行を指すキーの列で残りを読む（`fill`）。
- キーチェーンで開けないパスワード（409 `DB_PASSWORD_LOCKED`）は、つなぐ API を `connecting` で包んで `DbUnlockHost` に聞く。つなぐ API を足したら包む。
- 手順メモの名前を変えたらタブを `renameMemoTab` で付け替える（接続の `memo_path` はコアが付け替える）。
- 鍵を確かめるダイアログは接続のダイアログの中に開くので、閉じた知らせを外へ伝えない。
- ER 図の箱の寸法 `er/erBox.ts` は `db-er.css` と合わせる（並べる計算と画像で使う）。
