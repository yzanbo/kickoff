// notes がアプリの設定に出す節と欄: ノート・「表示」のチャットからノートを開く場所
import { StickyNote } from "lucide-react";
import type { SettingsItemDef, SettingsSectionDef } from "@/features/settings/ui";
import { NoteSettings } from "./NoteSettings";
import { NoteOpenField } from "./DisplayFields";

export const notesSection: SettingsSectionDef = { id: "notes", scope: "app", label: "ノート", icon: StickyNote, order: 90, Component: NoteSettings };
export const noteOpenItem: SettingsItemDef = { id: "notes.openIn", section: "display", order: 160, Component: NoteOpenField };
