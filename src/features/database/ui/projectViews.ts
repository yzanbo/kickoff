// database がプロジェクトの画面の表（projectViews）に出す画面: DB クライアント（この Mac のアプリの中だけ）
import { Database } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import { DatabaseViewPage } from "./projectViewPages";

export const databaseView: ProjectViewDef = {
  id: "db",
  label: "DB",
  tip: "DB クライアント",
  icon: Database,
  group: "db",
  order: 80,
  desktopOnly: true,
  places: ["center", "rightSidebar", "chatSide"],
  followsWorkplace: true,
  Page: DatabaseViewPage,
};
