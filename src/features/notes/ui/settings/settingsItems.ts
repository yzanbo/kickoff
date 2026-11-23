// notes がプロジェクトの設定に出す欄: 基本情報の「ノートフォルダ」（フォルダの欄と色の間）と、新しいプロジェクトのダイアログの「ノートの保存先」
import type { SettingsItemDef } from "@/features/settings/ui";
import { lazyPart } from "@/foundation/ui/points";
import type { NewProjectNoteFieldProps } from "@/features/projects/ui";
import { ProjectNoteDirField } from "./ProjectNoteDirField";

export const noteDirItem: SettingsItemDef = { id: "notes.noteDir", section: "basic", order: 10, Component: ProjectNoteDirField };

export const newProjectNoteDir = { Field: lazyPart<NewProjectNoteFieldProps>(() => import("./NewProjectNoteDirField").then((m) => ({ default: m.NewProjectNoteDirField }))) };
