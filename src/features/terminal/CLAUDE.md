# ターミナル（`features/terminal`）

内蔵ターミナル（パネルのタブ）。メインプロセスの側は `src/foundation/desktop/CLAUDE.md`。

## 地図

- `core/sessions.ts`: シェルを動かす `TerminalSessions`（シェルは `core/shell.ts` の形。macOS の値は `core/macosShell.ts`）。出力と snapshot は `core/output.ts`、AI に読ませる口は `core/control.ts`（AI のツールは `core/tools.ts`・`aiTerminal.ts`。決まりは `src/features/chat/core/CLAUDE.md`）。
- `ui/`: `TerminalPane`（作る・つなぐは `terminalSession.ts`）・種類 `terminalTabKind.ts`・`api/terminals.ts`・`native.ts`・下の欄 `bottom/`。

## 決まり

- シェルはコアで動かす。ワークツリーの中なら `PORT` も渡す。
- 開くフォルダは `@shared/terminal/folder.ts` の `terminalFolderOf`（プロジェクトは本体、共通はホームフォルダ）。画面はホームの場所を知らないので印 `~`（`HOME_FOLDER`）を渡し、コア（`expandHome`）と外のターミナルを開くメインが展開する。共通のワークツリーは断る。
- 持ち主は画面（`wc:<ID>`。画面が消えたらメインが `closeOwnedBy`）か端末か `host`。持ち主を替える口は、シェルがなければ始めずに 404（終わったコマンドを流し直さない）。
- 受け口は `@shared/terminal/contract.ts`。WebSocket（ターミナルだけ）は `attach` だけで、始めない。見るだけの端末の入力は捨て、打てるかは送るたびに読み直す。
- ⌘ のないキーはシェルのもの（ショートカット・Esc に渡さない）。つなぐたびに `meta`（持ち主・名前）を知らせる（AI が名前で示す）。

## 落とし穴

- `open` はあればつなぎ直していまの画面（`snapshot`）を返す。snapshot は書き終えるのを待ってから取り、取る間の出力は返したあとに送る。
- つなぐまでの出力は最初の snapshot に入っているので画面は捨てる。画面に出す注意も snapshot に入れる。
- タブを別ウィンドウへ移す・戻すときは、受け取った側が `claimTerminal` で持ち主になってから渡した側を閉じる。
- テストは `core/routes.test.ts`（`core/testing/fakeTerminal.ts`）。
