// ai が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの設定の「AI」の節
import { settingsSections } from "@/features/settings/ui";
import { projectAiSection } from "./settings/settingsSections";

export const contributes = [settingsSections.item(projectAiSection)];
