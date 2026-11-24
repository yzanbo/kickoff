// sidebar がアプリの設定に出す節: サイドバー
import { PanelLeft } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { SidebarViewSettings } from "@/features/sidebar/ui/SidebarViewSettings";

export const sidebarSection: SettingsSectionDef = { id: "sidebar", scope: "app", label: "サイドバー", icon: PanelLeft, order: 30, Component: SidebarViewSettings };
