# Docker タブ（`features/docker`）
<!-- 行き先: src/features/docker/ -->

プロジェクトの「Docker」タブ。compose のサービスの一覧・操作・ログ・シェル。コアは `src/core/CLAUDE.md` の「Docker タブ」、API は `api/docker.ts`。

| ファイル | 中身 |
|---|---|
| `useDocker.ts` | 状態と操作・「見ています」・取り直し |
| `DockerTab`・`DockerComposeBlock`・`DockerServiceRow` | 一覧 |
| `DockerLogs`・`useDockerLogs.ts`・`useDockerLog*.ts*` | ログの画面（流れ・⌘F・AI に渡す） |
| `dockerView.ts`・`dockerLogView.ts`・`ansi.ts` | 表示の文と行の形（純粋。テストは隣） |
| `useOpenDockerDb.ts` | 「DB で開く」 |

- この Mac のアプリの中だけ（`window.kickoff` がなければタブを出さない）。
- 確かめを聞くのは元に戻せない操作（片付け・作り直して起動）だけ。
- 作業場所の文はコアと同じ `@shared/docker/workplace` の `workplaceText`。
- 「見ています」は 20 秒ごと（コアは 45 秒届かなければ `docker events` を止める）。重なった取り直しは 1 回にまとめる。
- 別の作業場所と同じ組になる起動（409）は、コアの文で確かめてから `confirm_shared` で送り直す。
- ログはつなぎ直したら持っている行を捨てる（コアが最新の 500 行から送り直す）。読み返している間は古い行を捨てない。
- エラー・警告は行の文字で見分ける（標準出力か標準エラーかは使わない）。
- `ansi.ts` と `DockerLogRow` の `SpanView` は CI のタブのログも使う（変えたら CI のログも見る）。
