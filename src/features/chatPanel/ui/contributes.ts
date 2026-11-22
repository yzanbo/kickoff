// chatPanel が拡張点に出すもの（app/renderer/registry.ts が入れる）: チャットのタブの種類 5 つ、欄 3 つ（チャットのパネル・右の欄・別ウィンドウ）、新しいチャットの行き先と、「AI に渡す」の「新しいチャットで始める」
import { openTargets } from "@/foundation/ui/navigation/open";
import { handOffTargets } from "@/features/attachments/ui";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { CHAT_SURFACES } from "./chatSurfaces";
import { CHAT_TAB_KINDS } from "./chatTabKinds";
import { newChatHandOff } from "./handOffTarget";
import { newChatTarget } from "./openTargets";

export const contributes = [
  ...CHAT_TAB_KINDS.map((k) => panelTabs.item(k)),
  ...CHAT_SURFACES.map((s) => panelSurfaces.item(s)),
  openTargets.item(newChatTarget),
  handOffTargets.item(newChatHandOff),
];
