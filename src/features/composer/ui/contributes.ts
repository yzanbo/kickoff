// 入力欄が拡張点に出すもの（app/renderer/registry.ts が入れる）: 「AI に渡す」の渡し先のうち、入力欄に足すもの・⌘L
import { settingsItems } from "@/features/settings/ui";
import { handOffTargets } from "@/features/attachments/ui";
import { innerChatHandOff, innerChatPathHandOff, otherChatHandOff, thisChatHandOff, thisChatPathHandOff } from "./handOffTargets";
import { commands } from "@/foundation/ui/commands";
import { IS_MAC } from "@/foundation/ui/lib/keys";
import { focusChatComposer } from "./composerKeys";
import { composerCompactItem } from "./settings/appSettings";

export const contributes = [
  handOffTargets.item(thisChatHandOff),
  handOffTargets.item(thisChatPathHandOff),
  handOffTargets.item(innerChatHandOff),
  handOffTargets.item(innerChatPathHandOff),
  handOffTargets.item(otherChatHandOff),
  // チャット欄が見つからなければキーを奪わない。ほかの OS（ブラウザから開いたとき）の Ctrl+L はアドレス欄に残す
  commands.item({ id: "composer.focus", title: "チャット欄にピントを移す", keys: "mod+l", when: () => IS_MAC, run: focusChatComposer }),
  // 設定の「表示」の欄
  settingsItems.item(composerCompactItem),
];
