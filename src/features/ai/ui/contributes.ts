// ai が拡張点に出すもの（app/renderer/registry.ts が入れる）: アプリ・プロジェクトの設定の節・下の帯の札と使用状況
import { footerItems } from "@/foundation/ui/shell/points";
import { settingsSections } from "@/features/settings/ui";
import { projectAiSection } from "./settings/settingsSections";
import { usageSection, connectionSection, aiDefaultsSection } from "./settings/appSettings";
import { toolNoticesFooterItem, usageFooterItem } from "./footerItems";

export const contributes = [
  settingsSections.item(projectAiSection),
  settingsSections.item(usageSection),
  settingsSections.item(connectionSection),
  settingsSections.item(aiDefaultsSection),
  footerItems.item(toolNoticesFooterItem),
  footerItems.item(usageFooterItem),
];
