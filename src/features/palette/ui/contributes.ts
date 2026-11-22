// palette が拡張点に出すもの（app/renderer/registry.ts が入れる）: ⌘K と、チャットの中の文言の全文検索のコマンド
import { commands } from "@/foundation/ui/commands";
import { appHosts, openAppDialog } from "@/foundation/ui/shell/points";
import { openContentSearch } from "./index";
import { commandPaletteHost } from "./appHosts";

export const contributes = [
  commands.item({ id: "palette.open", title: "検索・移動", keys: "mod+k", run: () => openAppDialog("commandPalette") }),
  // キーはない（ボードの検索欄の横のボタンと ⌘K の「チャット内の文言」から開く）
  commands.item({ id: "palette.contentSearch", title: "チャット内の文言の全文検索", run: openContentSearch }),
  appHosts.item(commandPaletteHost),
];
