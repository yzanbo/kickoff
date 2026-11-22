// trash がアプリの設定に出す節: ゴミ箱と整理
import { Trash2 } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { TrashSettings } from "@/features/trash/ui/TrashSettings";

export const trashSection: SettingsSectionDef = { id: "trash", scope: "app", label: "ゴミ箱と整理", icon: Trash2, order: 160, Component: TrashSettings };
