// devices がアプリの設定に出すもの: 節「スマホ連携」と、節「接続」の Kickoff サーバーのカード
import { Smartphone } from "lucide-react";
import type { SettingsItemDef, SettingsSectionDef } from "@/features/settings/ui";
import { MobileSettings } from "./MobileSettings";
import { ServerStatusCard } from "./ServerStatusCard";

export const mobileSection: SettingsSectionDef = { id: "mobile", scope: "app", label: "スマホ連携", icon: Smartphone, order: 150, Component: MobileSettings };

/** 「接続」の節のカードの並びのいちばん前（AI・GitHub のカードより前） */
export const serverStatusItem: SettingsItemDef = { id: "devices.server", section: "connection", order: 10, Component: ServerStatusCard };
