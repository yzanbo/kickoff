# DB クライアント（`src/features/database`）

プロジェクトの「DB」タブ・チャットの右の欄の DB のタブ・その別ウィンドウの DB クライアント。

## 地図

| ファイル | 中身 |
|---|---|
| `core/service.ts`・`core/secrets.ts` | 接続（表 `db_connections`）・パスワードの金庫 `DbSecretVault`・AI の SQL `DatabaseService.aiQuery`（ツール `tools.ts`・CSV `aiExports.ts`・文 `aiFormat.ts`） |
| `core/client.ts`・`worker/` | DB ワーカーの呼び手 `DbWorkerClient`・ワーカー（頼みを流す `handler.ts`・ドライバ・SSH トンネル `tunnel.ts`・子の起こし方 `children.ts`） |
| `ui/DatabaseClient`・`ui/dbClientContext.ts` | 殻（左に接続の一覧、右にタブ）・下の部品が読む操作 `useDbClient` |
| `ui/Connection*.tsx`・`ui/DbFailureDialog`・`ui/DbPrepDialog`・`ui/dbNote.ts` | 接続の登録・編集・写す・取り込む・つながらないときの案内・準備・手順ノート |
| `ui/TableView`・`ui/SqlView`・`ui/DefinitionView`・`ui/er/` | テーブル・SQL・関数と列挙型のタブ・ER 図 |
| `ui/dbClientRequests.ts`・`ui/openSqlFromChat.ts` | 外（右の欄・Docker タブ・チャット）からの頼み |

開いているタブと形は `ui/client/dbClientTabs.ts`、接続の一覧は `ui/client/connectionsStore.ts`、CSS は `@/app/renderer/styles/database/`。

## 決まり

- この Mac のアプリの中だけで使う（`window.kickoff` がなければ「DB」タブを出さない）。口はどれも端末に開かない。
- 使う所は `LazyDatabaseClient` で読む（開くまで DB の画面と SQL の色付けを読み込まない）。ER 図も `lazy`。
- パスワードは `secrets` に、いつも `safeStorage` で暗号化して置く。画面には保存したか（`has_password` など）だけが届く。
- Kickoff の保存先（製品版・開発版の両方）の中の SQLite は、実体のパスで比べて断る。
- DB に触るのは別のプロセスの DB ワーカー（Electron ではメインが起こし MessagePort で直結）。重い SQL・止まった DB がコアの HTTP と SSE を止めないため。
- 読み取り専用は 2 段（文の判定 `@shared/database/sqlStatements.ts` と DB 側。SQLite は ATTACH も断る）。外すのは「書き込む」の間だけ（環境の名前を打たせる。タブだけ・覚えない）。書き込む前の確かめは `writeConfirmation` を接続の `write_check` に当てる。
- SQL は 1 回に 1 文だけ受ける。画面は `splitStatements` で分けて 1 文ずつ送り、失敗・止めた文で止める。
- 絞り込み・行の変更の SQL は共有の `dbFilter.ts` / `dbEdit.ts` が組み立てる（値はいつも params。WHERE の式は `assertWhere`）。行の変更は 1 つのトランザクションで、1 行に当たらなければすべて取り消す。
- AI の SQL は読み取りの 1 文だけ → 承認 → DB 側も読み取り専用・呼び出しごとの新しい接続 → 手元と DB 側の時間の上限 → 作業を止めたら止める。結果は頭の行だけ（多ければ OS の一時フォルダに CSV）。接続の情報を出さず `<db_data>` で包む。つなぐときにコマンドを流す接続は AI からつながない。AI に見せない接続では、AI に渡す・聞く・頼むのボタンを押せなくする。
- タブの状態は置き場所（`place`）ごとに覚える。外からの頼みは `requestDbClient`（まだ描いていなければ預ける）。

## 落とし穴

- コアはドライバと `yaml` を読み込まない（`testing/inProcessWorker.ts` を `core/client.ts` から import しない。ドライバはワーカーの中で使うときに `import()`）。ssh・シェルは `spawnTracked` で起こす。
- 同じ接続の名前（`shared:` / `sql:` など）への頼みは `handler.ts` の `serial` で 1 つずつ流す（並べると接続を二重に開く）。
- キーチェーンで開けなければ 409 `db_password_locked`。DB タブはつなぐ API を `connecting` で包んで `DbUnlockHost` に聞き、メモリにだけ持つ（つなぐ API を足したら包む）。AI のツールは失敗にする。
- 準備のコマンド（`prep`）は確かめるまで流さない。止めるときは子孫ごと止め、後片付けは接続を消した・自動で切れた・ワーカーを止めるときに流す。
- SSH トンネルはパスワードをファイルに書かず、同じ踏み台・同じ DB は 1 本を使い回す。known_hosts に足すのは画面で見せた指紋と合うときだけ（`sshHostKey.ts`）。
- 「書き込む」を戻す時計に、コミット・取り消しを数えない（理由は `useSqlWrite.ts`）。接続を替える・タブを閉じる・切るとき、トランザクションの途中なら先に `finishSession` で聞く。
- 裏のタブの結果は量の上限（`resultBudget.ts`）で捨て、戻ったら読み取りの文だけ流し直す（書く文は流さない）。
- テーブルの編集の保存は、書き直している欄を先に決めてから SQL を見せる。送る順は `buildEdits`（消す → 書き換える → 足す）。行のキー `rowKey` は読んだときの値。
- 長い値（`DbLongText`）は頭だけ届く。書き出し・書き直しの前に、行を指すキーの列で残りを読む（`fill`）。
- 手順ノートの名前を変えたらタブを `renameNoteTab` で付け替える（接続の `note_path` はコアが付け替える）。鍵を確かめるダイアログは接続のダイアログの中に開くので、閉じた知らせを外へ伝えない。
- ER 図の箱の寸法 `ui/er/erBox.ts` は `db-er.css` と合わせる（並べる計算と画像で使う）。
- テストは `core/routes/server.databases.test.ts`・`core/aiTools.test.ts`。PostgreSQL・MySQL・MariaDB は `worker/drivers.dbtest.ts` を `npm run test:db`（Docker。`npm test` に入れない）。
