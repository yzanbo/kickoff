// notes がプロジェクトの画面の表（projectViews）に出す画面: ノート（プロジェクトの外のフォルダ。作業場所には関係しない）
import { StickyNote } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import { NotesViewPage } from "./projectViewPages";

export const notesView: ProjectViewDef = { id: "notes", label: "ノート", icon: StickyNote, group: "notes", order: 70, places: ["center", "rightSidebar", "chatSide"], Page: NotesViewPage };
