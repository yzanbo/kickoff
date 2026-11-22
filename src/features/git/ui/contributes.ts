// git が拡張点に出すもの（app/renderer/registry.ts が入れる）: 変更のタブの種類と、プロジェクトの画面の変更・履歴、チャットの右の欄の「＋ ▾」の変更
import { panelTabs } from "@/features/panel/ui";
import { projectViews } from "@/features/projects/ui";
import { changesTabKind } from "./changesTabKind";
import { chatSideAdds } from "@/features/chatPanel/ui";
import { changesChatSideAdd, changesView, historyView } from "./projectViews";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { changesPopout } from "./popoutKinds";

export const contributes = [panelTabs.item(changesTabKind), projectViews.item(changesView), projectViews.item(historyView), chatSideAdds.item(changesChatSideAdd), popoutKinds.item(changesPopout)];
