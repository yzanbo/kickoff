// プロジェクトの画面の表（projectViews）のゴミ箱（Kickoff のゴミ箱。消したものを 3 日取っておき、元に戻せる。trash は projects より下の機能なので projects が出す）
import { Trash2 } from "lucide-react";
import type { ProjectViewDef } from "./projectViews";
import { TrashViewPage } from "./trashViewPage";

export const trashView: ProjectViewDef = {
  id: "trash",
  label: "ゴミ箱",
  tip: "ゴミ箱（3 日で消えます）",
  icon: Trash2,
  group: "trash",
  order: 120,
  places: ["center", "rightSidebar", "chatSide"],
  Page: TrashViewPage,
};
