// updates が設定に出すもの: 節「Kickoff について」（版と更新）・ダイアログのいちばん上の帯・⚙ の印・メインの知らせを受ける殻の hook
import { Info } from "lucide-react";
import type { SettingsItemDef, SettingsSectionDef } from "@/features/settings/ui";
import { SETTINGS_SLOTS } from "@/features/settings/ui";
import type { AppHost } from "@/foundation/ui/shell/points";
import { AboutSettings } from "./AboutSettings";
import { UpdateBadge, UpdateBanner } from "./UpdateBanner";
import { ABOUT_SECTION, useUpdatesBridge } from "./updatesStore";

export const aboutSection: SettingsSectionDef = { id: ABOUT_SECTION, scope: "app", label: "Kickoff について", icon: Info, order: 180, Component: AboutSettings };

export const updateBannerItem: SettingsItemDef = { id: "updates.banner", section: SETTINGS_SLOTS.dialogTop, order: 10, Component: UpdateBanner };
export const updateBadgeItem: SettingsItemDef = { id: "updates.badge", section: SETTINGS_SLOTS.buttonBadge, order: 10, Component: UpdateBadge };

export const updatesHost: AppHost = { id: "updates", windows: "main", useEffect: useUpdatesBridge };
