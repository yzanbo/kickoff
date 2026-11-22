// chatPanel が拡張点に出すもの（app/renderer/registry.ts が入れる）: 新しいチャットの行き先と、「AI に渡す」の「新しいチャットで始める」
import { openTargets } from "@/foundation/ui/navigation/open";
import { handOffTargets } from "@/features/attachments/ui";
import { newChatHandOff } from "./handOffTarget";
import { newChatTarget } from "./openTargets";

export const contributes = [openTargets.item(newChatTarget), handOffTargets.item(newChatHandOff)];
