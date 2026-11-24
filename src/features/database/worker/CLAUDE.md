# DB ワーカー（`features/database/worker`）

DB に触る別のプロセス（Electron ではメインが起こし MessagePort でコアと直結。重い SQL・止まった DB でコアを止めない）。

## 地図
- `handler.ts`（頼みを受ける・`serial`）・`connect.ts`・`tunnel.ts`（SSH）・`sshHostKey.ts`
- ドライバは流し方 `DbConn`（`conn.ts`）と読み方 `DbCatalog` を `common.ts` の `driverOf` で組む（`postgres/`・`mysql/`・`sqlite.ts`）

## 決まり
- ワーカーからコアを読まない（取り決めの型 `@shared/database/` だけ）。コアはドライバと `yaml` を読み込まない（ドライバは使うときに `import()`。`testing/inProcessWorker.ts` を core から読まない）。
- 読み取り専用は DB 側でもかける。読み取り専用の SQLite は ATTACH も断る。
- ssh・シェルは `spawnTracked` で起こし、止めるときは子孫ごと。

## 落とし穴
- 同じ接続の名前への頼みは `serial` で 1 つずつ流す（並べると二重に開く）。
- SSH トンネルはパスワードをファイルに書かず、同じ踏み台・同じ DB は 1 本を使い回す。known_hosts には画面で見せた指紋と合うときだけ足す。
- テスト: `*.test.ts`・`drivers.dbtest.ts`（`npm run test:db`。Docker で DB を立てる）。
