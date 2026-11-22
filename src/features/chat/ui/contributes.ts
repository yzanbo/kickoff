// chat が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { settingsSections } from "@/features/settings/ui";
import { openTargets } from "@/foundation/ui/navigation/open";
import { chatTarget } from "./openTargets";
import { chatSection } from "./settings/appSettings";
import { appHosts } from "@/foundation/ui/shell/points";
import { aiOpenRequestsHost } from "./appHosts";

export const contributes = [openTargets.item(chatTarget), settingsSections.item(chatSection), appHosts.item(aiOpenRequestsHost)];
