// database がプロジェクトの画面の表（projectViews）に出す画面: DB クライアント（この Mac のアプリの中だけ）
import { Database } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import type { ChatSideAdd } from "@/features/chatPanel/ui";
import { DatabaseViewPage, DbSubmenu } from "./projectViewPages";

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
  chatSide: {
    hint: (where) => `DB クライアント（SQLite は${where}のファイル）`,
    bare: true,
    popout: (at, where) => ({ route: { kind: "database", ...at }, title: `DB — ${where}` }),
  },
  Page: DatabaseViewPage,
};

/** チャットの右の欄の「＋ ▾」では、DB の画面の代わりに DB クライアントと接続の一覧 */
export const databaseChatSideAdd: ChatSideAdd = { view: "db", Submenu: DbSubmenu };
