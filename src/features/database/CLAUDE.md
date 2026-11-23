# DB クライアント（`src/features/database`）

プロジェクトの「DB」タブ・チャットの右の欄の DB のタブ・その別ウィンドウの DB クライアント。

## 地図

| ファイル | 中身 |
|---|---|
| `core/service.ts` | 組み立て: 登録 `connections`・つなぐ先 `target`（場所 `DbScope`）・木 `browse`・SQL のタブ `sqlTabs`・AI の SQL `aiQuery`（ツール `tools`）・金庫 `secrets` |
| `core/workerClient.ts`・`worker/` | 呼び手 `DbWorkerClient`・ワーカー（`handler.ts`・`connect.ts`・SSH `tunnel.ts`）。ドライバは流し方 `DbConn` と読み方 `DbCatalog`（`postgres/`・`mysql/`・`sqlite.ts`）を `driverOf` で組む |
| `ui/client/` | 殻 `DatabaseClient`（左に一覧、右にタブ。並びは `ui/dbClientTabs.ts`）・登録する画面・Docker タブからの頼み |
| `ui/state/` | 接続の一覧 `connectionsStore.ts`・操作 `useDbClient`・置き場所 `DbSurface`・外からの頼み `requestDbClient` |
| `ui/connection/`・`ui/tree/`・`ui/table/`・`ui/sql/`・`ui/write/`・`ui/er/`・`ui/ai/` | 接続（登録・失敗・準備・手順ノート・パスワードを聞く）・木・テーブル・SQL・書き込む・ER 図・AI |

呼び手は `ui/api.ts` の `dbApi`、CSS は `@/app/renderer/styles/database/`。サブフォルダは state → write → connection → tree・ai → table → sql・er → client の向きに読む。

## 決まり

- この Mac のアプリの中だけで使う（`window.kickoff` がなければ「DB」タブを出さない）。
- 使う所は `LazyDatabaseClient` で読む（開くまで DB の画面と SQL の色付けを読み込まない）。ER 図も `lazy`。
- パスワードは `secrets` に `safeStorage` で暗号化（画面には `has_password` などだけ）。Kickoff の保存先の SQLite は実体のパスで比べて断る。
- DB に触るのは別のプロセスの DB ワーカー（Electron ではメインが起こし MessagePort で直結。重い SQL・止まった DB でコアを止めない）。
- 読み取り専用（文の判定と DB 側）を外すのは「書き込む」の間だけ（環境の名前を打たせる。タブだけ・覚えない）。確かめは `writeConfirmation` を `write_check` に当てる。
- SQL は 1 回に 1 文。画面は `splitStatements` で分けて送り、失敗・止めた文で止める。
- 絞り込み・行の変更の SQL は共有の `dbFilter.ts` / `dbEdit.ts` が組み立てる（値はいつも params。WHERE の式は `assertWhere`）。行の変更は 1 つのトランザクションで、1 行に当たらなければすべて取り消す。
- AI の SQL の結果は頭の行だけ（多ければ OS の一時フォルダに CSV）。見せない接続では AI に渡す・聞く・頼むのボタンを押せなくする。
- タブの状態は置き場所（`DbSurface`）ごとに覚える。外からの頼みは `requestDbClient`（描く前なら預ける）。

## 落とし穴

- 安全の決まり 12 段（括弧はテスト。変えるなら先に見る）:
  - 文の判定（知らない文は書く文・MySQL の `/*! */` の中も文。`sqlStatements.test.ts`）・DB 側の読み取り専用（`worker/drivers.dbtest.ts`。Docker で `npm run test:db`）・読み取り専用の SQLite は ATTACH も DB 側で断る（`handler.test.ts`）
  - AI: 呼び出しごとの新しい接続・AI 用のユーザー・時間の上限 2 段（止めたら流さない）・見せない接続は名前も出さない・つなぐときにコマンドを流す接続は使わない（`aiTools.test.ts`・`tools.test.ts`・`hiddenDb.test.ts`）・`<db_data>` で包む（`aiFormat.test.ts`）
  - パスワードの暗号化（`secrets.test.ts`）・Kickoff 自身の DB を登録させない（`server.databases.test.ts`）。ほかに端末に開かない（`server.devices.test.ts`）・日時と大きな整数は文字（`values.test.ts`）
- 文の判定は SELECT の中の関数を見ない（`pg_terminate_backend` は READ ONLY でも通る。AI 用の読み取り専用ユーザーを勧める理由）。
- コアはドライバと `yaml` を読み込まない（`testing/inProcessWorker.ts` を core から読まない。ドライバは使うときに `import()`）。ssh・シェルは `spawnTracked` で起こす。
- 同じ接続の名前への頼みは `handler.ts` の `serial` で 1 つずつ流す（並べると二重に開く）。
- キーチェーンで開けなければ 409 `db_password_locked`。DB タブは `dbApi` が locked のルートで `askDbPassword` に聞き、メモリにだけ持つ。AI のツールは失敗にする。
- 準備のコマンド（`prep`）は確かめるまで流さない。止めるときは子孫ごと。後片付けは接続を消した・自動で切れた・ワーカーを止めるときに流す。
- SSH トンネルはパスワードをファイルに書かず、同じ踏み台・同じ DB は 1 本を使い回す。known_hosts には画面で見せた指紋と合うときだけ足す（`sshHostKey.ts`）。
- 「書き込む」を戻す時計にコミット・取り消しを数えない（`useSqlWrite.ts`）。接続を替える・タブを閉じる・切るとき、トランザクションの途中なら `finishSession` で聞く。
- 裏のタブの結果は量の上限（`resultBudget.ts`）で捨て、戻ったら読み取りの文だけ流し直す。
- テーブルの編集の保存は、書き直している欄を先に決めてから SQL を見せる。順は `buildEdits`（消す → 書き換える → 足す）。`rowKey` は読んだときの値。
- 長い値（`DbLongText`）は頭だけ届く。書き出し・書き直しの前に残りを読む（`fill`）。
- 手順ノートの名前を変えたらタブを `renameNoteTab` で付け替える（`note_path` はコア）。鍵を確かめるダイアログは接続のダイアログの中に開くので、閉じた知らせを外へ伝えない。
- ER 図の箱の寸法 `ui/er/erBox.ts` は `db-er.css` と合わせる。
