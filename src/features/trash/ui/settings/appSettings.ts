// trash がアプリの設定に出す節: ゴミ箱と整理（欄はほかの機能も入れる。trash の欄はプロジェクトのないもの）
import { Trash2 } from "lucide-react";
import type { SettingsItemDef, SettingsSectionDef } from "@/features/settings/ui";
import { TRASH_SETTINGS_SECTION, TrashSettings, UnassignedTrash } from "@/features/trash/ui/TrashSettings";

export const trashSection: SettingsSectionDef = { id: TRASH_SETTINGS_SECTION, scope: "app", label: "ゴミ箱と整理", icon: Trash2, order: 160, Component: TrashSettings };
export const unassignedTrashItem: SettingsItemDef = { id: "trash-unassigned", section: TRASH_SETTINGS_SECTION, order: 40, Component: UnassignedTrash };
