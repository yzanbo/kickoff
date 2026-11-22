// 殻がアプリの設定に出す欄: 「表示」の下の帯（registry が直に足す）
import type { SettingsItemDef } from "@/features/settings/ui";
import { FooterModeField } from "./FooterModeField";

export const footerModeItem: SettingsItemDef = { id: "shell.footerMode", section: "display", order: 200, Component: FooterModeField };
