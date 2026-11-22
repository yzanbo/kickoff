// notifications がアプリの設定に出す節: 通知
import { Bell } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { NotificationSettings } from "./NotificationSettings";

export const notificationsSection: SettingsSectionDef = { id: "notifications", scope: "app", label: "通知", icon: Bell, order: 120, Component: NotificationSettings };
