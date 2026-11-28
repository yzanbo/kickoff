// updates がアプリの設定に出す節: Kickoff について（版と更新）
import { Info } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { AboutSettings } from "./AboutSettings";

/** 節の id（メニューの「アップデートを確認…」もこの節を開く） */
export const ABOUT_SECTION = "about";

export const aboutSection: SettingsSectionDef = { id: ABOUT_SECTION, scope: "app", label: "Kickoff について", icon: Info, order: 180, Component: AboutSettings };
