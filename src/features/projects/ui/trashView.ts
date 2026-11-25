// プロジェクトの画面の表（projectViews）のゴミ箱（Kickoff のゴミ箱。消したものを 3 日取っておき、元に戻せる。trash は projects より下の機能なので projects が出す）
import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { FolderGit2, Trash2 } from "lucide-react";
import type { SettingsItemDef } from "@/features/settings/ui";
import { TRASH_SETTINGS_SECTION, type TrashKindView } from "@/features/trash/ui";
import { TrashedProjects } from "./settings/TrashedProjects";
import type { ProjectViewDef } from "./projectViews";
import { TrashViewPage } from "./trashViewPage";

export const trashView: ProjectViewDef = {
  id: "trash",
  label: "ゴミ箱",
  tip: `ゴミ箱（${TRASH_KEEP_DAYS} 日で消えます）`,
  icon: Trash2,
  group: "trash",
  order: 120,
  common: true,
  places: ["center", "rightSidebar", "chatSide"],
  chatSide: { hint: () => `ゴミ箱（${TRASH_KEEP_DAYS} 日で消えます）`, about: `消したものを ${TRASH_KEEP_DAYS} 日取っておき、元に戻せる`, bare: true },
  Page: TrashViewPage,
};

/** ゴミ箱の種類 project の行（誰が消したかは出さず、時刻に「に削除」を添える） */
export const projectTrashKind: TrashKindView = { kind: "project", icon: () => FolderGit2, By: null, trashedSuffix: " に削除" };

/** 設定の「ゴミ箱と整理」のゴミ箱のプロジェクトの欄 */
export const trashedProjectsItem: SettingsItemDef = { id: "projects-trashed", section: TRASH_SETTINGS_SECTION, order: 10, Component: TrashedProjects };
