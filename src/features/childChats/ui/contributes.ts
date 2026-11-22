// 子チャットの画面が拡張点に出すもの（app/renderer/registry.ts が入れる）: 「AI に渡す」の「新しい子チャットで聞く」
import { handOffTargets } from "@/features/attachments/ui";
import { childChatHandOff } from "./handOffTarget";

export const contributes = [handOffTargets.item(childChatHandOff)];
