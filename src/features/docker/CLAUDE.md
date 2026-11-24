# Docker（`features/docker`）

プロジェクトの「Docker」タブ。compose のサービスの一覧・操作・ログ・シェル。

## 地図

| ファイル | 中身 |
|---|---|
| `core/list.ts`・`operations.ts`・`watch.ts` | 読み `DockerLister`（一覧のもとは同時 1 回＋1 秒）・操作 `DockerOperations`・events とログ `DockerWatch`。呼び方は `DockerCli`、compose の覚えは `ComposeConfigCache`。ほかの機能には `DockerApi`（`compose`・`portProbe`・`dbCandidate`・`facts`）だけ |
| `core/actions.ts`・`core/listing.ts` | 操作のコマンド `planDockerAction`・一覧の見出し（どちらも純粋） |
| `core/facts.ts`・`core/guard/` | AI の守りが見る様子・守り（`src/features/guard/CLAUDE.md`） |
| `ui/useDocker.ts` | 状態と操作・「見ています」・取り直し（`useQuery` の `dedupe: "trailing"`） |
| `ui/dockerActions.ts`・`ui/DockerActionItems.tsx` | 操作の表（見出し・サービス・使い捨て。押せる条件と理由はここだけ）と、そのメニューの項目 |
| `ui/DockerTab`・`ui/DockerComposeBlock`・`ui/DockerServiceRow` | 一覧（ポート・静かなぶつかりは `DockerPorts`、使い捨ては `DockerOneoffs`、失敗の欄は `DockerFailure`） |
| `ui/DockerLogs`・`ui/useDockerLogs.ts`・`ui/useDockerLog*.ts*`・`ui/useLog*.ts` | ログの画面（流れ・⌘F・AI に渡す・絞り込み・付いていくスクロール） |
| `ui/dockerView.ts`・`ui/dockerLogView.ts` | 表示の文と行の形（純粋。テストは隣） |
| `ui/useOpenDockerDb.ts` | 「DB で開く」（`open({ kind: "dockerDb" })`。受け手・受け口・案は database） |

## 決まり

- エンジンは管理せず `docker` コマンドだけ。DB は使わない。この Mac のアプリの中だけ（`window.kickoff` がなければタブを出さない）。口は端末に開かない。
- compose の設定は compose 自身に聞く（YAML を読まない）。どのプロジェクトかは `working_dir` の `deepestWorkplace`。作業場所の文はコアと画面で同じ `@shared/foundation/workplace` の `workplaceText`。
- 停止・再起動・片付けは `-p` だけで `/` から流す（ファイルのあるフォルダで流すと札付きが残る）。片付けに `-v` は付けない。
- 操作は compose ごとに 1 つずつ（取り直す前に予約し、2 つ目は 409）。up は時間で打ち切らず［中止］で止める。
- 確かめを聞くのは元に戻せない操作（片付け・作り直して起動）だけ。別の作業場所と同じ組になる起動（409）は、コアの文で確かめてから `confirm_shared` で送り直す。
- docker events は画面の貸し出しの間だけ流す。ログは保存しない。

## 落とし穴

- ポートの取り合いで相手を止めたら、ぶつかったサービスは `--force-recreate` で作り直す（理由は `core/actions.ts`）。
- AI の守りが見る様子は時間で打ち切り、答えなければ通す側に倒す。
- 「見ています」は 20 秒ごと（コアは 45 秒届かなければ `docker events` を止める）。重なった取り直しは 1 回にまとめる。
- ログはつなぎ直したら持っている行を捨てる（コアが最新の 500 行から送り直す）。読み返している間は古い行を捨てない。エラー・警告は行の文字で見分ける（標準出力か標準エラーかは使わない）。
- ログの色は土台の `ansi/`（`ansiSpans`・`AnsiText`）。CI のタブのログも使う（変えたら CI のログも見る）。
- 操作の前後・docker events の変化では、覚えた一覧のもとを捨ててから `docker_changed` を出す（`createDocker` の `changed`）。
- 受け口は `@shared/docker/contract.ts`（`…/docker/db` は database）。events の貸し出しは土台の `Lease`。
- テストは `core/routes.test.ts`・database の `routes.dockerDb.test.ts`（`dockerFake`）・`core/actions.test.ts`。
