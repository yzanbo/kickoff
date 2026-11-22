// remoteImages がアプリの設定に出す節: リンクと画像
import { Link2 } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { LinkSettings } from "./LinkSettings";

export const linksSection: SettingsSectionDef = { id: "links", scope: "app", label: "リンクと画像", icon: Link2, order: 100, Component: LinkSettings };
