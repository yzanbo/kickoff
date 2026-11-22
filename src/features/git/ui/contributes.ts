// git が拡張点に出すもの（app/renderer/registry.ts が入れる）: 変更のタブの種類と、プロジェクトの画面の変更・履歴
import { panelTabs } from "@/features/panel/ui";
import { projectViews } from "@/features/projects/ui";
import { changesTabKind } from "./changesTabKind";
import { changesView, historyView } from "./projectViews";

export const contributes = [panelTabs.item(changesTabKind), projectViews.item(changesView), projectViews.item(historyView)];
