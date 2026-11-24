# DB クライアント（`features/database`）

プロジェクトの「DB」タブ・チャットの右の欄の DB のタブ・その別ウィンドウ。DB に触るワーカーは `worker/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `DB-`。

## 地図
- `core/service.ts`: 登録 `connections`・つなぐ先 `target`・木 `browse`・SQL のタブ `sqlTabs`・AI の SQL `aiQuery`・金庫 `secrets`。`core/workerClient.ts`（`DbWorkerClient`）
- `ui/client/`（殻 `DatabaseClient`。読むのは `LazyDatabaseClient`）・`ui/state/`（`connectionsStore.ts`・`useDbClient`・`DbSurface`・`requestDbClient`）・`ui/api.ts`（`dbApi`）
- `ui/connection/`・`tree/`・`table/`・`sql/`・`write/`・`er/`・`ai/`（state → write → connection → tree・ai → table → sql・er → client の向きに読む）

## 決まり
- この Mac のアプリの中だけで使う（`window.kickoff` がなければ「DB」タブを出さない）。開くまで画面と色付けを読み込まない。
- パスワードは `secrets` に `safeStorage` で暗号化（画面には `has_password` だけ）。Kickoff 自身の DB は実体のパスで比べて登録させない。
- 読み取り専用（文の判定と DB 側）を外すのは「書き込む」の間だけ（環境の名前を打たせる。タブだけ・覚えない）。SQL は 1 回に 1 文。
- 絞り込み・行の変更の SQL は `dbFilter.ts` / `dbEdit.ts` が組む（値はいつも params、WHERE は `assertWhere`）。行の変更は 1 つのトランザクションで、1 行に当たらなければすべて取り消す。
- AI は呼び出しごとの新しい接続・AI 用のユーザー・時間の上限 2 段。結果は頭の行だけ（多ければ一時フォルダに CSV）、`<db_data>` で包む。見せない接続は名前も出さず、AI に渡すボタンも押せなくする。つなぐときにコマンドを流す接続は AI に使わない。

## 落とし穴
- 安全の決まりの段は変えるなら先にテストを見る: 文の判定 `sqlStatements.test.ts`・DB 側の読み取り専用 `worker/drivers.dbtest.ts`・ATTACH `handler.test.ts`・AI `aiTools.test.ts`・`tools.test.ts`・`hiddenDb.test.ts`・`aiFormat.test.ts`・暗号化 `secrets.test.ts`・自身の DB `core/routes.test.ts`・日時と大きな整数は文字 `values.test.ts`。端末には開かない。
- 文の判定は SELECT の中の関数を見ない（`pg_terminate_backend` は READ ONLY でも通る。AI 用の読み取り専用ユーザーを勧める理由）。
- キーチェーンで開けなければ 409 `db_password_locked`（DB タブは `askDbPassword` で聞きメモリにだけ持つ。AI のツールは失敗）。
- 準備のコマンド（`prep`）は確かめるまで流さない。「書き込む」を戻す時計にコミット・取り消しを数えない。トランザクションの途中で替える・閉じるときは `finishSession` で聞く。
- 裏のタブの結果は `resultBudget.ts` で捨て、戻ったら読み取りの文だけ流し直す。編集の保存は書き直している欄を先に決め、順は `buildEdits`（消す → 書き換える → 足す）。
- 長い値（`DbLongText`）は頭だけ届く（書き出し・書き直しの前に `fill`）。手順ノートの名前を変えたら `renameNoteTab`。ER 図の箱の寸法 `erBox.ts` は `db-er.css` と合わせる。
