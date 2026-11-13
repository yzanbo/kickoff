# Docker タブ（`features/docker`）

プロジェクトの「Docker」タブ（`ProjectPage` の `tab === "docker"`。`#/projects/:id/docker`）。本体とワークツリーの compose のサービスを見て、起動・停止・再起動・片付けし、ログ（一覧の下の専用の画面）とシェルを開く。要件は `docs/requirements.md` の 5.14、詳しい仕様はメモの「Docker 仕様書」、コア（一覧・操作・docker events）は `src/core/CLAUDE.md` の「Docker タブ」。この Mac のアプリの中だけで使う（DB・GitHub と同じく、ブラウザ・スマホから開いたときはタブを出さずボードにする。`window.kickoff` があるか）。

## 状態と取り直し（`useDocker.ts`）

- 開いた瞬間に「見ています」（`api.dockerWatch`。今の一覧も返る）を送り、20 秒ごとに送り続ける（ウィンドウが隠れている間は送らず、戻ったらすぐ送る）。コアは 45 秒届かなければ `docker events` を止めるので、タブを閉じれば何もしなくても止まる。
- 変化は SSE の `docker_changed`（そのプロジェクトの分）で取り直す。重なった取り直しは 1 回にまとめ、終わってからもう 1 回だけ。［↻］は `refresh` で compose の設定を読み直す。
- 操作（`act`）は待たずに始まり、応答の「始めたあとの一覧」（動いている操作が入っている）をそのまま出す。別の作業場所と同じ組になる起動（409・`DOCKER_SHARED_PROJECT`）は、コアの文で確かめてから `confirm_shared` で送り直す。
- エンジンが止まっているときの開くボタン（`openEngine`）は、開いたあと 2 秒ごとに 30 秒まで一覧を調べ直し、動いたら「見ています」を送り直す（OrbStack はアプリが開いたままエンジンだけ止まっていることがあるので、コアが `orb start` も流す）。

## 一覧（`DockerTab` → `DockerComposeBlock` → `DockerServiceRow`）

- 見出しの行: 「Docker」・context の名前・［↻］。エンジンが入っていない・動いていないときは `EmptyState`（入っていない = 入れ方の案内、動いていない = context から決めた開くボタン（OrbStack・Docker Desktop）か、コピーするコマンド（colima）と「もう一度確かめる」）。compose が 1 つもなければその旨と探した場所。一覧の下に、ほかのプロジェクトで動いているコンテナの数を 1 行（乗せると名前とポート `othersTip`）と、AI の守りの説明を 1 行（`GUARD_NOTE`。効くのは Kickoff が起動したチャットの AI だけだと本文に書き、乗せると見抜けないもの（Kickoff の外の AI・人・eval・変数・スクリプトのファイル・DB の中の削除・Docker のソケット）を出す `GUARD_TIP`。守りそのものはコアの `chat/guard/dockerGuard.ts`）。
- compose の見出し: ファイルの場所（押すとファイルタブで開く `openProjectFile`）・作業場所の札（`WorktreeChip`）・組の名前・「（作っていない）」と、操作のまとまり（`.docker-compose-actions`。狭いときはまとまりごと折り返す）: 作り直して起動（設定が変わっているときだけ）・すべて起動（押せない理由は `start_blocked`）・すべて停止（動いているものがあるときだけ）・⋯（すべて起動・すべて停止・すべて再起動・作り直して起動…・片付け…（押せない理由は `down_blocked`）・compose のファイルを開く）。見出しの右クリックも同じメニュー。操作が動いている間はボタンの代わりに「起動中…」など（`DOCKER_ACTION_BUSY_LABELS`）と、流れ続ける up なら［中止］。
- 確かめを聞くのは元に戻せないものだけ: 片付け（「コンテナとネットワークを消します（使い捨てのコンテナも消します）。ボリューム（DB のデータ）は残ります」）と作り直して起動（「新しい設定でコンテナを作り直します。データ（ボリューム）は残ります」。数を増やしたサービスがあれば 1 つに戻ることも）。起動・停止・再起動は聞かない。
- 見出しの下: 同じ組の名前の相手ごとの ⚠（`shareText`）・設定を読めなかったときの ⚠ と標準エラー・最後の失敗（何ができなかったか・標準エラーの最後の行・［ターミナルで流し直す］（下のパネルに、失敗したコマンドを決まったコマンドのタブで開く）・［×］で閉じる `dismiss`）。
- サービスの行: 印（`MARK_GLYPHS`。色は動いている = 緑・異常に終了 = 赤・起動中 / 一時停止 = 黄）・名前・イメージ・様子の文（`serviceStatusText`。1 つだけ動いているときは出さない）・Mac に出しているポート（`servicePorts`。押すとチャット欄のブラウザで `http://localhost:<ポート>`、右クリックで外部のブラウザ・URL のコピー・DB のサービスなら DB で開く。ポートの右クリックは行の右クリックまで届かせない）・操作（印で決める主な操作 = 停止 / 再開 / 起動、動いていれば再起動、動いているコンテナがあればシェル、DB のサービス（`db_kind`）なら「DB で開く」）。右クリックに起動・停止・再起動・再開・シェル・DB で開くを並べる。札付きのサービスは動いていなければ薄く、「tools のときだけ」。使い捨てのコンテナは行の下に「└ 使い捨て n 個（m 個動いている）」と畳み、開くと 1 つずつ並べて動いているものに［停止］（`stop_container`）と［ログ］（同じものを右クリックにも。`OneoffRow`）。
- ポートの取り合い（要件 5.14・仕様書「ポートの取り合い」）: 起動・作り直しがポートで失敗したら（コアが失敗に `conflicts` を付ける）、相手を、ぶつかったサービスの行の下に出す（`conflictsByService`: 失敗した操作が起動しようとしたサービス（行の操作ならそのサービス、すべて起動なら札のないもの）のうち相手のポートを出すもの。どのサービスがぶつかったのかをひと目で分かるように。前は見出しの下の失敗の中にまとめていた）。行ごとに相手の文（`conflictText`。「:5432 は「本体 | main の db」が使っています」）、2 つ以上のサービスがぶつかったら、それぞれの行に相手を出し、［相手を止めて起動］はぶつかった最初の行に 1 つだけ（`stopOthersLabel`。相手が 1 つならその名前。押すと相手をまとめて止める。`stop_others_and_start`: 相手を docker stop し、起動できなかったサービスを作り直してから元の操作をやり直す。聞かない。ボリュームのデータは残る）。どの行にも当たらない相手だけは失敗の中に出す（行が 1 つもなければボタンもそこに）。Docker の外のプロセスが同じポートを待っている静かなぶつかり（一覧の `silent`。コンテナの ID ごと）は、ポートのボタンに ⚠（`is-warn`）とサービスの行の下に文（`silentText`）と［Docker の外の <プロセス> を使う］（このサービスのコンテナを止める）、Homebrew のサービスなら［Docker の <サービス> を使う］（危ない確かめのあと `api.dockerBrewStop` で `brew services stop`。知らせに戻すコマンドのコピー）。動いているのに Mac に出すはずのポートを出していないサービス（`unpublishedPorts`。ポートで起動に失敗したコンテナは、あとで docker start してもポートを出さないまま動き、作り直すまで直らない）は、行の下に文と［作り直す］（サービスを指した `recreate` = そのサービスだけ `--force-recreate`）。
- 「DB で開く」（要件 5.14 の段階 2・仕様書「段階 2: DB で開く」。`useOpenDockerDb.ts`）: postgres・mysql・mariadb のイメージのサービスの行のボタン（`Database` の印）・行の右クリック・ポートの右クリック。compose に ports がなく Mac にポートを出していなければ押せず、乗せると `DOCKER_DB_NO_PORT`（「Mac にポートを出していないので、DB クライアントからはつなげません」）。動いていなければ「<サービス> が動いていません。起動しますか」と確かめて起動を送り、一覧でそのサービスが動き出し操作が終わったら開く（起動に失敗したら開かない。失敗は見出しに出る。待つ間ボタンは押せない）。開くときは `api.dockerDbTarget` に聞き、登録済みの同じ DB（種類・この Mac の中のホスト・ポート）ならその接続を DB タブの木で開き（`requestDbClient` の `focus`）、なければ DB タブの取り込みの画面をその案だけ選んだ形で開く（`import`。案は compose に聞いた設定から作るので、ワークツリーの db が本体と別のポートなら名前に「（feat-x）」が付き、同じポートなら本体と同じ接続を開く）。行き先は `#/projects/:id/db`（DB クライアントの置き場所は `project-<ID>`）。ワークツリーを消しても、その db の接続は消さない（未決）。
- シェル: 下のパネル（`bottom:<プロジェクト>`）に、決まったコマンドのターミナルのタブ（`shellCommand`。bash があれば bash、なければ sh。タブの名前は「シェル · <サービス>」）を開く。数を増やしたサービスは 1 番目の動いているコンテナ。
- ［ログ］: compose の見出し（すべての札）・サービスの行（そのサービスの札。作ったものだけ）・使い捨ての行（「svc · 使い捨て」の札）と、それぞれの右クリック。

## ログの画面（`DockerLogs`。一覧の下）

- 置き場所: Docker タブの一覧の下。境目のつまみで高さを変える（`DOCKER_LOG_HEIGHT`。タブの高さの %。ダブルクリックで戻す）。開いている間、一覧は上の残りでスクロールする。見出しは「ログ: <札>」と札の並び・切り替え（エラー・警告だけ・時刻・折り返し・探す）・［×］。開くのは compose 1 つで、別の［ログ］を押すと札を選び直す（`DockerLogsRequest` の `nonce`）。compose がなくなった・エンジンが止まったら出さない。
- 流れ（`useDockerLogs.ts`）: コアの SSE（`api.dockerLogsUrl`。`EventSource`）でコンテナ（`sources`）と行を受け、時刻の順に混ぜて持つ（`mergeRows`。届いた行は 1 フレームの分をまとめる）。持つのは 1 万行（`LOG_ROW_LIMIT`）までで古い行から捨てる。読み返している間（いちばん下にいない `setHold`）は捨てずに 2 万行まで（位置がずれないように）。止まった・起動したは区切りの行（「── db が止まりました（exit 1）12:05:10 ──」）。つなぎ直したら（コアが最新の 500 行から送り直すので）持っている行を捨てる。「さらに前を読む」は、いま出している札のコンテナごとに持っているいちばん古い行より前の 500 行（`api.dockerLogsBefore`）。500 行より少なければ、そのコンテナはもう前がないとしてボタンを出さない（捨てたら出し直す）。
- 札: compose のサービスの並び（まだ作っていないサービスは点線で薄く「まだ起動していません」）と、使い捨ての札（`logChips`）。押して出す・隠す。サービスごとに色（`.docker-log-c0`〜7）。いくつものコンテナを出しているときだけ、行の頭に札の名前（app#1 など）。
- 見え方: いちばん下にいる間は付いていき、上へ戻すと止まって「最新へ ↓（新しい行 n）」（止めたあとに届いた、止めたときの最後の行より新しい行の数。さかのぼって読んだ行は数えない）。時刻・折り返しの切り替えは覚える（`DOCKER_LOG_TIMESTAMPS` / `DOCKER_LOG_WRAP`）。アプリが付けた色（ANSI の SGR。16 色・256 色・24 bit・太字など）はそのまま出し（`ansi.ts` の `ansiSpans`。色は `styles/docker/docker-ansi.css`）、ほかの制御の印は落とす（`stripAnsi`）。JSON の行（オブジェクトか配列）は押すと整えて開く（`prettyJson`）。見えていない行は描かない（`content-visibility: auto`）。
- エラーと警告: 行の文字の決まりで見分ける目安（`logLevelOf`。ERROR・FATAL・panic（単独も）・Exception（単独も・NullPointerException なども）・TypeError などの名前・行の「Error:」・Traceback・level=error など → エラー、WARN・WARNING など → 警告。標準出力か標準エラーかは使わない）。行の左に赤・黄の印、「エラー・警告だけ出す」の切り替え。見分けは行ごとに 1 回（`WeakMap`）。
- ⌘F（`useDockerLogFind.ts`）: ログの画面を `registerPageFind` に置くので、ピントがある・最後に押したのがログの画面ならアプリ全体の ⌘F でここが開く（見出しの虫眼鏡でも）。見た目と操作は `FindField`（探し方の「Aa」「ab」「.*」はほかの欄と同じ値）。色の印を外した文から探し、見つけた所に印（`markSpans` で色のまとまりを切る）、↑↓ で移って真ん中に出す。「一致した行だけ」。
- AI に渡す（`useDockerLogMenu.tsx`）: 行を選び終えると範囲の終わりの下に「チャットに追加 ▾」、右クリックに「コピー」と同じ渡し先（`HandOffItems`。選んだ範囲の行をまるごと渡す）。行の右クリック（選んでいないとき）は「この行をコピー」と「この行と前後 20 行をチャットに追加」。エラーの行に乗せると「AI に聞く」（前後 20 行。同じものを右クリックにも）。入力欄に足す文は、頭に「Docker のログ: 本体 | main・compose.yaml・db（myapp-db-1）・12:01:03〜12:01:09」の文脈を付けたコードのブロック（`logQuote`。行は「時刻 札 | 文」、色の印は外す）。長ければ（ターミナルと同じ 30 行・3000 文字を超える）押した時点の中身の札（出どころ `docker_logs`。外から来た中身ではない）。送るのは自分。

## 表示の文（純粋な関数。テストは隣の `*.test.ts`）

- `useOpenDockerDb.ts`: 「DB で開く」の起動の確かめ・動き出すまで待つ・行き先を聞いて DB タブで開く。
- `dockerView.ts`: 印の文字 `MARK_GLYPHS`・様子の文 `serviceStatusText`・ポート `servicePorts`・使い捨てのまとめ `oneoffSummary`・同じ組の ⚠ の文 `shareText`・シェルのコマンド `shellCommand`・ほかのプロジェクトの説明 `othersTip`・ポートの取り合いの文 `conflictText` / `stopOthersLabel` / `silentText`・相手をぶつかったサービスに分ける `conflictsByService`・出していないポート `unpublishedPorts`。
- `dockerLogView.ts`: 行の並べ方 `mergeRows`・時刻 `normTs` / `fillTs` / `clockOf`・札 `chipOf` / `logChips`・エラーと警告 `logLevelOf`・JSON `prettyJson`・区切りの文 `separatorText`・AI に渡す文 `logQuote` / `rowText` / `logCaptureLabel`・前後の行 `aroundRow`。
- 作業場所の文（「本体 | main」）はコアと同じ `@shared/docker/workplace` の `workplaceText`。
- `ansi.ts`: 色のまとまり `ansiSpans`・色の印を外す `stripAnsi`・見つけた所の印 `markSpans`。

API の窓口は `api/docker.ts`。CSS は `styles/docker/docker-list.css`（一覧）・`docker-ports.css`（ポートの ⚠ とぶつかりの文）・`docker-logs.css`（ログの画面）・`docker-ansi.css`（ログの色）。
