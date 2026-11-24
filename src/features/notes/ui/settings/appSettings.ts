// notes がアプリの設定に出す節と欄: ノート・「表示」のチャットからノートを開く場所・「ゴミ箱と整理」の共通のノートのゴミ箱
import { StickyNote } from "lucide-react";
import type { SettingsItemDef, SettingsSectionDef } from "@/features/settings/ui";
import { NoteSettings } from "./NoteSettings";
import { TRASH_SETTINGS_SECTION } from "@/features/trash/ui";
import { NoteOpenField } from "./DisplayFields";
import { CommonNotesTrash } from "./CommonNotesTrash";

export const notesSection: SettingsSectionDef = { id: "notes", scope: "app", label: "ノート", icon: StickyNote, order: 90, Component: NoteSettings };
export const noteOpenItem: SettingsItemDef = { id: "notes.openIn", section: "display", order: 160, Component: NoteOpenField };
export const commonNotesTrashItem: SettingsItemDef = { id: "notes.commonTrash", section: TRASH_SETTINGS_SECTION, order: 35, Component: CommonNotesTrash };
