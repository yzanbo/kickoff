// 子チャットの画面が拡張点に出すもの（app/renderer/registry.ts が入れる）: 「AI に渡す」の「新しい子チャットで聞く」
import { settingsItems } from "@/features/settings/ui";
import { handOffTargets } from "@/features/attachments/ui";
import { childChatHandOff } from "./handOffTarget";
import { childChatsDisplayItems } from "./settings/appSettings";

export const contributes = [handOffTargets.item(childChatHandOff), ...childChatsDisplayItems.map((i) => settingsItems.item(i))];
