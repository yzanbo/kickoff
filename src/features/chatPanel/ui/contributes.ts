// chatPanel が拡張点に出すもの（app/renderer/registry.ts が入れる）: チャットのタブの種類 5 つ、新しいチャットの行き先と、「AI に渡す」の「新しいチャットで始める」
import { openTargets } from "@/foundation/ui/navigation/open";
import { handOffTargets } from "@/features/attachments/ui";
import { panelTabs } from "@/features/panel/ui";
import { CHAT_TAB_KINDS } from "./chatTabKinds";
import { newChatHandOff } from "./handOffTarget";
import { newChatTarget } from "./openTargets";

export const contributes = [...CHAT_TAB_KINDS.map((k) => panelTabs.item(k)), openTargets.item(newChatTarget), handOffTargets.item(newChatHandOff)];
