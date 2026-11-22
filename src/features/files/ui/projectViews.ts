// files がプロジェクトの画面の表（projectViews）に出す画面: ファイル・検索
import { Files, Search } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import { EditorViewPage } from "./projectViewPages";

const code = { group: "code", places: ["center", "rightSidebar", "chatSide"], followsWorkplace: true, Page: EditorViewPage } as const;

export const filesView: ProjectViewDef = { id: "files", label: "ファイル", icon: Files, order: 30, ...code };
export const searchView: ProjectViewDef = { id: "search", label: "検索", icon: Search, order: 40, ...code };
