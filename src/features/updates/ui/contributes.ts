// updates が拡張点に出すもの（app/renderer/registry.ts が入れる）: アプリの設定の節「Kickoff について」
import { settingsSections } from "@/features/settings/ui";
import { aboutSection } from "./settings/appSettings";

export const contributes = [settingsSections.item(aboutSection)];
