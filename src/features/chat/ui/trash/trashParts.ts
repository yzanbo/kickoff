// chat がゴミ箱に出すもの: 種類 chat・session の行の描き方と、設定の「ゴミ箱と整理」のアーカイブ済みのチャットの整理・使っていない会話記録の欄
import { History, MessageSquare } from "lucide-react";
import type { SettingsItemDef } from "@/features/settings/ui";
import { TRASH_SETTINGS_SECTION, type TrashKindView } from "@/features/trash/ui";
import { ArchiveCleanup } from "./ArchiveCleanup";
import { OrphanSessions } from "./OrphanSessions";
import { SessionTrashBy } from "./SessionTrashBy";

export const chatTrashKind: TrashKindView = { kind: "chat", icon: () => MessageSquare };
export const sessionTrashKind: TrashKindView = { kind: "session", icon: () => History, By: SessionTrashBy };

export const archiveCleanupItem: SettingsItemDef = { id: "chat-archive-cleanup", section: TRASH_SETTINGS_SECTION, order: 20, Component: ArchiveCleanup };
export const orphanSessionsItem: SettingsItemDef = { id: "chat-orphan-sessions", section: TRASH_SETTINGS_SECTION, order: 30, Component: OrphanSessions };
