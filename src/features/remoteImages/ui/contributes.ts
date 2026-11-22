// remoteImages が拡張点に出すもの（app/renderer/registry.ts が入れる）: アプリの設定の節
import { settingsSections } from "@/features/settings/ui";
import { linksSection } from "./settings/appSettings";

export const contributes = [settingsSections.item(linksSection)];
