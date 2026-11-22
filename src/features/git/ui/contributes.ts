// git が拡張点に出すもの（app/renderer/registry.ts が入れる）: 変更のタブの種類
import { panelTabs } from "@/features/panel/ui";
import { changesTabKind } from "./changesTabKind";

export const contributes = [panelTabs.item(changesTabKind)];
