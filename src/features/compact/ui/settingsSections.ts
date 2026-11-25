// compact がプロジェクトの設定（設定の節 scope: "project"）に出す節: 圧縮前・圧縮後指示（そのプロジェクトの指示）
import { Shrink } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { CompactPromptSettings } from "./CompactPromptSettings";

export const projectCompactSection: SettingsSectionDef = { id: "compact", scope: "project", label: "圧縮前・圧縮後指示", icon: Shrink, order: 60, common: true, Component: CompactPromptSettings };
