// projects がプロジェクトの設定（設定の節 scope: "project"）に出す節: 基本情報・参照資料・削除
import { FileText, Library, Trash2 } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { BasicInfo } from "./BasicInfo";
import { DeleteProject } from "./DeleteProject";
import { ReferencesSection } from "./ReferenceEditor";

export const basicSection: SettingsSectionDef = { id: "basic", scope: "project", label: "基本情報", icon: FileText, order: 10, Component: BasicInfo };
export const referencesSection: SettingsSectionDef = { id: "refs", scope: "project", label: "参照資料", icon: Library, order: 20, Component: ReferencesSection };
export const deleteSection: SettingsSectionDef = { id: "danger", scope: "project", label: "削除", icon: Trash2, order: 90, danger: true, Component: DeleteProject };
