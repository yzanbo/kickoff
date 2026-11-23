// chat が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { settingsItems, settingsSections } from "@/features/settings/ui";
import { trashKinds } from "@/features/trash/ui";
import { openTargets } from "@/foundation/ui/navigation/open";
import { chatTarget } from "./openTargets";
import { chatSection } from "./settings/appSettings";
import { appHosts } from "@/foundation/ui/shell/points";
import { aiOpenRequestsHost } from "./appHosts";
import { archiveCleanupItem, chatTrashKind, orphanSessionsItem, sessionTrashKind } from "./trash/trashParts";

export const contributes = [
  openTargets.item(chatTarget),
  settingsSections.item(chatSection),
  appHosts.item(aiOpenRequestsHost),
  trashKinds.item(chatTrashKind),
  trashKinds.item(sessionTrashKind),
  settingsItems.item(archiveCleanupItem),
  settingsItems.item(orphanSessionsItem),
];
