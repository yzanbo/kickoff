// compact がアプリの設定に出す節と欄: 圧縮前・圧縮後指示の節・「チャット」の節の自動圧縮を始める量
import { Shrink } from "lucide-react";
import type { SettingsItemDef, SettingsSectionDef } from "@/features/settings/ui";
import { AutoCompactSetting } from "./AutoCompactSetting";
import { CompactPromptSettings } from "./CompactPromptSettings";

export const compactAppSection: SettingsSectionDef = { id: "compact", scope: "app", label: "圧縮前・圧縮後指示", icon: Shrink, order: 80, Component: CompactPromptSettings };

/** 「チャット」の節（chat の ChatSettings）の、自動のアーカイブの次に置く欄 */
export const autoCompactItem: SettingsItemDef = { id: "compact-auto-compact", section: "chats", order: 10, Component: AutoCompactSetting };
