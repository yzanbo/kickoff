// diagnostics がアプリの設定に出す節: 診断
import { Activity } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { DiagnosticsSettings } from "./DiagnosticsSettings";

export const diagnosticsSection: SettingsSectionDef = { id: "diagnostics", scope: "app", label: "診断", icon: Activity, order: 170, Component: DiagnosticsSettings };
