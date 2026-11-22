// 入力欄が拡張点に出すもの（app/renderer/registry.ts が入れる）: 「AI に渡す」の渡し先のうち、入力欄に足す 2 つ
import { handOffTargets } from "@/features/attachments/ui";
import { otherChatHandOff, thisChatHandOff } from "./handOffTargets";

export const contributes = [handOffTargets.item(thisChatHandOff), handOffTargets.item(otherChatHandOff)];
