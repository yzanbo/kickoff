// 別ウィンドウの種類の表（URL の項目の表は持ち主の機能の ui/popoutKinds.ts。描く部品はまだ PopoutApp.tsx が種類で描き分ける）
import { browserPopout } from "@/features/browser/ui/popoutKinds";
import { chatPopout, chatsPopout, sidePopout, subagentPopout } from "@/features/chatPanel/ui/popoutKinds";
import { databasePopout } from "@/features/database/ui/popoutKinds";
import { filePopout } from "@/features/files/ui/popoutKinds";
import { changesPopout } from "@/features/git/ui/popoutKinds";
import { notePopout } from "@/features/notes/ui/popoutKinds";
import { sidebarPopout } from "@/features/sidebar/ui/popoutKinds";
import { terminalPopout } from "@/features/terminal/ui/popoutKinds";
import { popoutKinds } from "@/foundation/ui/navigation/popout";

export const contributes = [
  popoutKinds.item(changesPopout),
  popoutKinds.item(filePopout),
  popoutKinds.item(subagentPopout),
  popoutKinds.item(chatPopout),
  popoutKinds.item(notePopout),
  popoutKinds.item(databasePopout),
  popoutKinds.item(sidebarPopout),
  popoutKinds.item(sidePopout),
  popoutKinds.item(browserPopout),
  popoutKinds.item(chatsPopout),
  popoutKinds.item(terminalPopout),
];
