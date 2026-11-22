// devices がアプリの設定に出す節: スマホ連携
import { Smartphone } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { MobileSettings } from "./MobileSettings";

export const mobileSection: SettingsSectionDef = { id: "mobile", scope: "app", label: "スマホ連携", icon: Smartphone, order: 150, Component: MobileSettings };
