// subagents が拡張点に出すもの（app/renderer/registry.ts が入れる）: 設定の「表示」の欄
import { settingsItems } from "@/features/settings/ui";
import { subagentOpenItem } from "./settings/appSettings";

export const contributes = [settingsItems.item(subagentOpenItem)];
