// notes がプロジェクトの設定に出す欄: 基本情報の「ノートフォルダ」（フォルダの欄と色の間）
import type { SettingsItemDef } from "@/features/settings/ui";
import { ProjectNoteDirField } from "./ProjectNoteDirField";

export const noteDirItem: SettingsItemDef = { id: "notes.noteDir", section: "basic", order: 10, Component: ProjectNoteDirField };
