// compact がアプリの設定に出す節: 圧縮前・圧縮後指示
import { Shrink } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { CompactPromptSettings } from "./CompactPromptSettings";

export const compactAppSection: SettingsSectionDef = { id: "compact", scope: "app", label: "圧縮前・圧縮後指示", icon: Shrink, order: 80, Component: CompactPromptSettings };
