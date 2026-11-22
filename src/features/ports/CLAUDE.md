# ポートを使っているプロセス（`src/features/ports`）

## 地図

- `core/service.ts`: プロジェクトのフォルダでポートを待っているプロセスを調べる・止める（`PortProcessService`。DB には持たない。OS の読み取りは `ProcessProbe`）。調べる時は `watch.ts`。
- `ui/`: 下の帯の項目（`footerItems.ts`）と一覧（`portsStore.ts`）。帯を隠しているときの窓は `PortsFallback`。

## 決まり

- Kickoff 自身（Helper も）とその祖先は出さず、止めさせない。止めるのは、調べ直して `command_full` が同じものだけ。
- 調べるのは頼まれたとき・止めたあと・作業の終わりだけ。Mac のアプリの中だけ。
- 一覧はコマンドの全文を含むので SSE に載せず（`ports_changed` は数だけ）、口も端末に開かない。

## 落とし穴

- テストは `core/routes/server.ports.test.ts`（`portsFake`）。
