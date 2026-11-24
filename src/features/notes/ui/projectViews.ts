// notes がプロジェクトの画面の表（projectViews）に出す画面: ノート（プロジェクトの外のフォルダ。作業場所には関係しない）
import { StickyNote } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import type { ChatSideAdd } from "@/features/chatPanel/ui";
import { NotesViewPage, RecentNotesSubmenu } from "./projectViewPages";

export const notesView: ProjectViewDef = { id: "notes", label: "ノート", icon: StickyNote, group: "notes", order: 70, places: ["center", "rightSidebar", "chatSide"], Page: NotesViewPage };

/** チャットの右の欄の「＋ ▾」では、ノートの画面の代わりに最近変えたノートの一覧 */
export const notesChatSideAdd: ChatSideAdd = { view: "notes", Submenu: RecentNotesSubmenu };
